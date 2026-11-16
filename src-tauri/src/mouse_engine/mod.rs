//! Native mouse/scroll engine (macOS CGEventTap, Windows WH_MOUSE_LL hook).
//!
//! Reverse direction, speed scaling and optional smooth scrolling for wheel
//! mice. Trackpad protection is the load-bearing rule on both systems: only
//! discrete wheel notches are touched; precision/continuous input passes
//! through unchanged. Config lives in lock-free atomics so the hot input
//! callbacks never block.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

pub mod smooth;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::start;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::start;

/// Engine config, read on every scroll event. Speed is an f64 stored as its bit
/// pattern so it fits in an atomic.
pub(crate) struct EngineConfig {
    /// Master switch. When false every event passes through untouched.
    pub enabled: AtomicBool,
    /// Reverse vertical scroll direction.
    pub reverse: AtomicBool,
    /// Multiplier applied to the scroll distance (1.0 = unchanged). f64 bits.
    speed_bits: AtomicU64,
    /// Ease wheel notches out over ~200 ms instead of jumping.
    pub smooth: AtomicBool,
}

pub(crate) static CONFIG: EngineConfig = EngineConfig {
    enabled: AtomicBool::new(false),
    reverse: AtomicBool::new(false),
    speed_bits: AtomicU64::new(0x3FF0_0000_0000_0000), // 1.0
    smooth: AtomicBool::new(true),
};

impl EngineConfig {
    pub fn speed(&self) -> f64 {
        f64::from_bits(self.speed_bits.load(Ordering::Relaxed))
    }
}

/// `None`: this OS has the engine.
pub fn unavailable_reason() -> Option<&'static str> {
    None
}

pub fn set_config(enabled: bool, reverse: bool, speed: f64, smooth: bool) {
    CONFIG.enabled.store(enabled, Ordering::Relaxed);
    CONFIG.reverse.store(reverse, Ordering::Relaxed);
    // Clamp to a sane band so a bad value can't make scrolling unusable.
    let clamped = if speed.is_finite() { speed.clamp(0.1, 20.0) } else { 1.0 };
    CONFIG.speed_bits.store(clamped.to_bits(), Ordering::Relaxed);
    CONFIG.smooth.store(smooth, Ordering::Relaxed);
}

pub fn get_config() -> (bool, bool, f64, bool) {
    (
        CONFIG.enabled.load(Ordering::Relaxed),
        CONFIG.reverse.load(Ordering::Relaxed),
        CONFIG.speed(),
        CONFIG.smooth.load(Ordering::Relaxed),
    )
}

/// Work for the emitter thread, sent from the input callback (a channel send
/// never blocks, so the callback stays fast).
pub(crate) enum Msg {
    /// Add (vertical, horizontal) distance to the smoothers.
    Smooth(f64, f64),
    /// Emit this (vertical, horizontal) amount immediately.
    #[cfg_attr(target_os = "macos", allow(dead_code))]
    Now(f64, f64),
}

/// Emitter loop shared by both platforms: owns one smoother per axis, ticks at
/// 120 Hz while animating and sleeps on the channel otherwise. `emit` receives
/// the integer (vertical, horizontal) amount for each tick.
#[cfg(any(target_os = "macos", windows))]
pub(crate) fn run_emitter(
    rx: std::sync::mpsc::Receiver<Msg>,
    mut emit: impl FnMut(i32, i32),
) {
    use smooth::{Smoother, TICK_SECS};
    use std::sync::mpsc::RecvTimeoutError;
    use std::time::{Duration, Instant};

    let tick = Duration::from_secs_f64(TICK_SECS);
    let (mut v, mut h) = (Smoother::new(), Smoother::new());
    let mut next = Instant::now();
    loop {
        let idle = v.is_idle() && h.is_idle();
        let msg = if idle {
            match rx.recv() {
                Ok(m) => Some(m),
                Err(_) => return,
            }
        } else {
            let now = Instant::now();
            if now >= next {
                None
            } else {
                match rx.recv_timeout(next - now) {
                    Ok(m) => Some(m),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
        };
        match msg {
            Some(m) => {
                if idle {
                    next = Instant::now();
                }
                match m {
                    Msg::Smooth(dv, dh) => {
                        if dv != 0.0 {
                            v.add(dv);
                        }
                        if dh != 0.0 {
                            h.add(dh);
                        }
                    }
                    Msg::Now(dv, dh) => emit(dv.round() as i32, dh.round() as i32),
                }
            }
            None => {
                if !CONFIG.enabled.load(Ordering::Relaxed) {
                    v.clear();
                    h.clear();
                    continue;
                }
                let (sv, sh) = (v.tick(TICK_SECS), h.tick(TICK_SECS));
                if sv != 0 || sh != 0 {
                    emit(sv, sh);
                }
                next += tick;
                let now = Instant::now();
                if next + tick * 4 < now {
                    next = now + tick;
                }
            }
        }
    }
}
