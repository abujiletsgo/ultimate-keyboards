//! Native mouse/scroll engine — our own, not a fork of Mac Mouse Fix.
//!
//! A CGEventTap intercepts scroll-wheel events and rewrites them: reverse
//! direction and speed scaling to start. It runs on a dedicated thread with its
//! own CFRunLoop, and reads its config from lock-free atomics so the hot event
//! callback never blocks.
//!
//! Trackpad protection (the load-bearing rule): we ONLY touch discrete
//! scroll-wheel events (`IsContinuous == 0`). Continuous/phase events — the
//! MacBook's built-in trackpad and other precision devices — pass through
//! byte-identical, so multi-finger gestures and momentum are never disturbed.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;

use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    EventField,
};

/// Engine config, read on every scroll event. Speed is an f64 stored as its bit
/// pattern so it fits in an atomic (no lock on the hot path).
struct EngineConfig {
    /// Master switch. When false the callback passes every event through untouched.
    enabled: AtomicBool,
    /// Reverse vertical scroll direction.
    reverse: AtomicBool,
    /// Multiplier applied to the scroll delta (1.0 = unchanged). f64 bits.
    speed_bits: AtomicU64,
}

static CONFIG: EngineConfig = EngineConfig {
    enabled: AtomicBool::new(false),
    reverse: AtomicBool::new(false),
    speed_bits: AtomicU64::new(0), // set to 1.0 on start()
};

/// Set once the tap thread is running, so we don't spawn it twice.
static STARTED: OnceLock<bool> = OnceLock::new();

fn speed() -> f64 {
    f64::from_bits(CONFIG.speed_bits.load(Ordering::Relaxed))
}

/// Public config setter, called from the Tauri command layer.
pub fn set_config(enabled: bool, reverse: bool, speed: f64) {
    CONFIG.enabled.store(enabled, Ordering::Relaxed);
    CONFIG.reverse.store(reverse, Ordering::Relaxed);
    // Clamp to a sane band so a bad value can't make scrolling unusable.
    let clamped = speed.clamp(0.1, 20.0);
    CONFIG.speed_bits.store(clamped.to_bits(), Ordering::Relaxed);
}

pub fn get_config() -> (bool, bool, f64) {
    (
        CONFIG.enabled.load(Ordering::Relaxed),
        CONFIG.reverse.load(Ordering::Relaxed),
        speed(),
    )
}

/// Transform one scroll event in place. Returns without touching the event when
/// disabled, when it's a continuous (trackpad) event, or when it's a no-op.
fn transform(event: &core_graphics::event::CGEvent) {
    if !CONFIG.enabled.load(Ordering::Relaxed) {
        return;
    }

    // Trackpad protection: never touch continuous/precision scroll events.
    let is_continuous = event.get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_IS_CONTINUOUS);
    if is_continuous != 0 {
        return;
    }

    let reverse = CONFIG.reverse.load(Ordering::Relaxed);
    let spd = speed();
    if !reverse && (spd - 1.0).abs() < f64::EPSILON {
        return; // nothing to do
    }

    let factor = spd * if reverse { -1.0 } else { 1.0 };

    // Line-based delta (integer) — the primary field for discrete wheels.
    let line1 = event.get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_DELTA_AXIS_1);
    if line1 != 0 {
        let scaled = ((line1 as f64) * factor).round() as i64;
        event.set_integer_value_field(EventField::SCROLL_WHEEL_EVENT_DELTA_AXIS_1, scaled);
    }

    // Point (pixel) delta — set when present so momentum/pixel consumers agree.
    let point1 = event.get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_POINT_DELTA_AXIS_1);
    if point1 != 0 {
        let scaled = ((point1 as f64) * factor).round() as i64;
        event.set_integer_value_field(EventField::SCROLL_WHEEL_EVENT_POINT_DELTA_AXIS_1, scaled);
    }

    // Fixed-point delta — keep it consistent with the line delta.
    let fixed1 = event.get_double_value_field(EventField::SCROLL_WHEEL_EVENT_FIXED_POINT_DELTA_AXIS_1);
    if fixed1 != 0.0 {
        event.set_double_value_field(
            EventField::SCROLL_WHEEL_EVENT_FIXED_POINT_DELTA_AXIS_1,
            fixed1 * factor,
        );
    }
}

/// Start the scroll engine. Spawns the tap thread once; later calls are no-ops.
/// Returns Err if the event tap can't be created (usually missing Accessibility
/// permission), so the UI can prompt the user to grant it.
pub fn start() -> Result<(), String> {
    if STARTED.get().is_some() {
        return Ok(());
    }

    // Default speed 1.0 before the frontend pushes real config.
    if CONFIG.speed_bits.load(Ordering::Relaxed) == 0 {
        CONFIG.speed_bits.store(1.0f64.to_bits(), Ordering::Relaxed);
    }

    // Probe: try creating a tap on this thread first so we can return a real
    // error synchronously (permission failures happen here).
    let probe = CGEventTap::new(
        CGEventTapLocation::HID,
        CGEventTapPlacement::HeadInsertEventTap,
        CGEventTapOptions::Default,
        vec![CGEventType::ScrollWheel],
        |_proxy, _type, event| {
            transform(event);
            None // keep the (possibly mutated-in-place) event
        },
    );
    if probe.is_err() {
        return Err(
            "Couldn't create the scroll event tap. Grant Ultimate Keyboards Accessibility \
             access in System Settings › Privacy & Security › Accessibility, then try again."
                .to_string(),
        );
    }
    drop(probe); // we'll create the real, run-loop-attached tap on the worker thread

    std::thread::Builder::new()
        .name("mouse-engine".into())
        .spawn(|| {
            let tap = match CGEventTap::new(
                CGEventTapLocation::HID,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::Default,
                vec![CGEventType::ScrollWheel],
                |_proxy, _type, event| {
                    transform(event);
                    None
                },
            ) {
                Ok(t) => t,
                Err(_) => {
                    eprintln!("mouse-engine: failed to create event tap on worker thread");
                    return;
                }
            };

            let loop_source = match tap.mach_port.create_runloop_source(0) {
                Ok(s) => s,
                Err(_) => {
                    eprintln!("mouse-engine: failed to create runloop source");
                    return;
                }
            };
            let run_loop = CFRunLoop::get_current();
            unsafe {
                run_loop.add_source(&loop_source, kCFRunLoopCommonModes);
            }
            tap.enable();
            CFRunLoop::run_current();
        })
        .map_err(|e| format!("Failed to spawn mouse-engine thread: {e}"))?;

    let _ = STARTED.set(true);
    Ok(())
}
