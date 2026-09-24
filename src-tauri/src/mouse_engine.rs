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

use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU64, Ordering};
use std::sync::mpsc;
use std::time::Duration;

use core_foundation::base::TCFType;
use core_foundation::mach_port::CFMachPortRef;
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    EventField,
};

extern "C" {
    /// Re-enable a tap the system switched off (`TapDisabledByTimeout` /
    /// `TapDisabledByUserInput`). Not re-exported by core-graphics.
    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
}

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

/// Claimed (compare-exchange) by whichever caller spawns the tap thread, so two
/// concurrent `start()` calls can never create two taps. Reset if creation fails.
static STARTED: AtomicBool = AtomicBool::new(false);

/// The live tap's mach port, so the event callback can re-enable it when the
/// system disables it after a slow callback or user-input timeout.
static TAP_PORT: AtomicPtr<core_foundation::mach_port::__CFMachPort> =
    AtomicPtr::new(std::ptr::null_mut());

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

const PERMISSION_HELP: &str = "Couldn't create the scroll event tap. Grant Ultimate Keyboards \
Accessibility access in System Settings › Privacy & Security › Accessibility, then try again.";

/// Start the scroll engine. Spawns the tap thread exactly once; later calls are
/// no-ops. The tap is created on the worker thread and its result is reported
/// back over a channel, so permission failures surface synchronously to the UI
/// without a throwaway probe tap ever being installed.
pub fn start() -> Result<(), String> {
    if STARTED
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Ok(());
    }

    // Default speed 1.0 before the frontend pushes real config.
    if CONFIG.speed_bits.load(Ordering::Relaxed) == 0 {
        CONFIG.speed_bits.store(1.0f64.to_bits(), Ordering::Relaxed);
    }

    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let spawned = std::thread::Builder::new()
        .name("mouse-engine".into())
        .spawn(move || {
            let tap = match CGEventTap::new(
                CGEventTapLocation::HID,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::Default,
                vec![CGEventType::ScrollWheel],
                |_proxy, ty, event| {
                    match ty {
                        // The system disables a tap whose callback stalled or
                        // when the user input times out; switch it back on.
                        CGEventType::TapDisabledByTimeout
                        | CGEventType::TapDisabledByUserInput => {
                            let port = TAP_PORT.load(Ordering::Acquire);
                            if !port.is_null() {
                                unsafe { CGEventTapEnable(port, true) };
                            }
                        }
                        _ => transform(event),
                    }
                    None // keep the (possibly mutated-in-place) event
                },
            ) {
                Ok(t) => t,
                Err(_) => {
                    let _ = tx.send(Err(PERMISSION_HELP.to_string()));
                    return;
                }
            };

            let loop_source = match tap.mach_port.create_runloop_source(0) {
                Ok(s) => s,
                Err(_) => {
                    let _ = tx.send(Err("mouse-engine: failed to create runloop source".into()));
                    return;
                }
            };
            TAP_PORT.store(tap.mach_port.as_concrete_TypeRef(), Ordering::Release);
            let run_loop = CFRunLoop::get_current();
            unsafe {
                run_loop.add_source(&loop_source, kCFRunLoopCommonModes);
            }
            tap.enable();
            let _ = tx.send(Ok(()));
            CFRunLoop::run_current();
        });

    let result = match spawned {
        Err(e) => Err(format!("Failed to spawn mouse-engine thread: {e}")),
        Ok(_) => match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(r) => r,
            Err(_) => Err("mouse-engine: tap thread did not report back".into()),
        },
    };
    if result.is_err() {
        // Let a later attempt (after the user grants Accessibility) try again.
        STARTED.store(false, Ordering::Release);
    }
    result
}
