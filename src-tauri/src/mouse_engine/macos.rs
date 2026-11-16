//! macOS side: a CGEventTap on ScrollWheel rewrites discrete wheel events
//! (reverse + speed) or, with smooth scrolling on, swallows them and lets the
//! emitter post eased pixel-scroll events instead. The tap runs on its own
//! thread with a CFRunLoop and reads config from lock-free atomics.
//!
//! Trackpad protection (the load-bearing rule): we ONLY touch discrete
//! scroll-wheel events (`IsContinuous == 0`). Continuous/phase events — the
//! MacBook's built-in trackpad and other precision devices — pass through
//! byte-identical, as do our own synthetic events (marked in the event's
//! source user data).

use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};
use std::sync::{mpsc, OnceLock};
use std::time::Duration;

use core_foundation::base::TCFType;
use core_foundation::mach_port::CFMachPortRef;
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CGEvent, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    EventField, ScrollEventUnit,
};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

use super::{run_emitter, Msg, CONFIG};

extern "C" {
    /// Re-enable a tap the system switched off (`TapDisabledByTimeout` /
    /// `TapDisabledByUserInput`). Not re-exported by core-graphics.
    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
}

/// Claimed (compare-exchange) by whichever caller spawns the tap thread, so two
/// concurrent `start()` calls can never create two taps. Reset if creation fails.
static STARTED: AtomicBool = AtomicBool::new(false);

/// The live tap's mach port, so the event callback can re-enable it when the
/// system disables it after a slow callback or user-input timeout.
static TAP_PORT: AtomicPtr<core_foundation::mach_port::__CFMachPort> =
    AtomicPtr::new(std::ptr::null_mut());

/// Feeds the emitter thread (smooth mode).
static EMIT_TX: OnceLock<mpsc::Sender<Msg>> = OnceLock::new();

/// Tag on our synthetic events (EVENT_SOURCE_USER_DATA) so the tap ignores them.
const MARKER: i64 = 0x554B_5343; // "UKSC"

/// Pixels per wheel line (one notch at speed 1.0). Mac Mouse Fix lands near
/// 50-60; stock macOS is about 10 with acceleration on top.
const PIXELS_PER_LINE: f64 = 50.0;

/// The 0.24 tap API cannot return "drop", so neutralise the event: zero every
/// delta and turn it into a Null event, which the system discards.
fn swallow(event: &CGEvent) {
    for f in [
        EventField::SCROLL_WHEEL_EVENT_DELTA_AXIS_1,
        EventField::SCROLL_WHEEL_EVENT_DELTA_AXIS_2,
        EventField::SCROLL_WHEEL_EVENT_POINT_DELTA_AXIS_1,
        EventField::SCROLL_WHEEL_EVENT_POINT_DELTA_AXIS_2,
    ] {
        event.set_integer_value_field(f, 0);
    }
    event.set_type(CGEventType::Null);
}

/// Emitter thread: post each tick as a synthetic pixel scroll event.
fn spawn_emitter() -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<Msg>();
    std::thread::Builder::new()
        .name("mouse-emitter".into())
        .spawn(move || {
            let Ok(source) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) else {
                return;
            };
            run_emitter(rx, |v, h| {
                if let Ok(ev) =
                    CGEvent::new_scroll_event(source.clone(), ScrollEventUnit::PIXEL, 2, v, h, 0)
                {
                    ev.set_integer_value_field(EventField::EVENT_SOURCE_USER_DATA, MARKER);
                    ev.post(CGEventTapLocation::Session);
                }
            });
        })
        .map_err(|e| format!("Failed to spawn mouse-emitter thread: {e}"))?;
    let _ = EMIT_TX.set(tx);
    Ok(())
}

/// Transform one scroll event in place (or hand it to the smoother). Returns
/// without touching the event when disabled, when it's a continuous (trackpad)
/// event, or when it's a no-op.
fn transform(event: &CGEvent) {
    if !CONFIG.enabled.load(Ordering::Relaxed) {
        return;
    }

    // Trackpad protection: never touch continuous/precision scroll events.
    let is_continuous = event.get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_IS_CONTINUOUS);
    if is_continuous != 0 {
        return;
    }

    let reverse = CONFIG.reverse.load(Ordering::Relaxed);
    let spd = CONFIG.speed();

    if CONFIG.smooth.load(Ordering::Relaxed) {
        if let Some(tx) = EMIT_TX.get() {
            let line_v = event.get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_DELTA_AXIS_1);
            let line_h = event.get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_DELTA_AXIS_2);
            if line_v != 0 || line_h != 0 {
                let sign = if reverse { -1.0 } else { 1.0 };
                let k = PIXELS_PER_LINE * spd;
                if tx
                    .send(Msg::Smooth(line_v as f64 * k * sign, line_h as f64 * k))
                    .is_ok()
                {
                    swallow(event);
                }
            }
            return;
        }
    }

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

    if let Err(e) = spawn_emitter() {
        STARTED.store(false, Ordering::Release);
        return Err(e);
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
                        _ => {
                            // Our own synthetic smooth-scroll events pass untouched.
                            if event.get_integer_value_field(EventField::EVENT_SOURCE_USER_DATA)
                                != MARKER
                            {
                                transform(event);
                            }
                        }
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
