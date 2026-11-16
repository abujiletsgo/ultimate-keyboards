//! Watchdog arithmetic for the keyboard hook, kept free of Win32 so it is tested anywhere.
//!
//! Three things can go wrong silently. The hook thread can stop pumping messages (the
//! hook callback or message loop is stuck), after which Windows stops calling the hook.
//! Windows can also remove an LL hook without telling us (a callback ran past its
//! time-out). And the whole process can stall. The `Beats` are plain atomics so the
//! watchdog never needs the service lock to judge health.
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::time::Instant;

/// Hook thread silent for this long: release everything.
pub const STALL_MS: u64 = 1000;
/// No key traffic for this long: prove the hook is still installed with a probe key.
pub const PROBE_IDLE_MS: u64 = 2000;
/// A probe the hook has not seen after this long means the hook is gone.
pub const PROBE_WAIT_MS: u64 = 500;

/// Milliseconds on one monotonic clock for the whole process.
pub fn now_ms() -> u64 {
    static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_millis() as u64
}

#[derive(Default)]
pub struct Beats {
    /// The hook is meant to be installed.
    pub active: AtomicBool,
    /// Last timer tick of the hook thread's message loop.
    pub pump: AtomicU64,
    /// Last time the hook callback ran for any event, probe included.
    pub hook: AtomicU64,
}

impl Beats {
    pub fn arm(&self, now: u64) {
        self.pump.store(now, Relaxed);
        self.hook.store(now, Relaxed);
        self.active.store(true, Relaxed);
    }
    pub fn disarm(&self) {
        self.active.store(false, Relaxed);
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Verdict {
    Healthy,
    /// The caller injects the probe key now.
    SendProbe,
    HookThreadStalled,
    HookRemoved,
}

#[derive(Default)]
pub struct Guard {
    probe_sent: Option<u64>,
}

impl Guard {
    pub fn check(&mut self, beats: &Beats, now: u64) -> Verdict {
        if !beats.active.load(Relaxed) {
            self.probe_sent = None;
            return Verdict::Healthy;
        }
        let (pump, hook) = (beats.pump.load(Relaxed), beats.hook.load(Relaxed));
        if now.saturating_sub(pump) >= STALL_MS {
            return Verdict::HookThreadStalled;
        }
        if let Some(sent) = self.probe_sent {
            if hook >= sent {
                self.probe_sent = None;
            } else if now.saturating_sub(sent) >= PROBE_WAIT_MS {
                self.probe_sent = None;
                return Verdict::HookRemoved;
            }
            return Verdict::Healthy;
        }
        if now.saturating_sub(hook) >= PROBE_IDLE_MS {
            self.probe_sent = Some(now);
            return Verdict::SendProbe;
        }
        Verdict::Healthy
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn armed() -> (Beats, Guard) {
        let b = Beats::default();
        b.arm(0);
        (b, Guard::default())
    }

    #[test]
    fn idle_hook_is_probed_and_a_seen_probe_clears() {
        let (b, mut g) = armed();
        b.pump.store(1990, Relaxed);
        assert_eq!(g.check(&b, 1999), Verdict::Healthy);
        assert_eq!(g.check(&b, 2000), Verdict::SendProbe);
        b.pump.store(2100, Relaxed);
        b.hook.store(2100, Relaxed); // the callback saw the probe
        assert_eq!(g.check(&b, 2200), Verdict::Healthy);
        assert_eq!(g.check(&b, 2300), Verdict::Healthy);
    }

    #[test]
    fn an_unseen_probe_means_the_hook_was_removed() {
        let (b, mut g) = armed();
        for t in (0..=2000).step_by(100) {
            b.pump.store(t, Relaxed);
            let v = g.check(&b, t);
            assert_eq!(v, if t == 2000 { Verdict::SendProbe } else { Verdict::Healthy });
        }
        b.pump.store(2400, Relaxed);
        assert_eq!(g.check(&b, 2400), Verdict::Healthy);
        b.pump.store(2500, Relaxed);
        assert_eq!(g.check(&b, 2500), Verdict::HookRemoved);
    }

    #[test]
    fn typing_keeps_the_hook_from_being_probed() {
        let (b, mut g) = armed();
        for t in (100..10_000).step_by(100) {
            b.pump.store(t, Relaxed);
            b.hook.store(t, Relaxed);
            assert_eq!(g.check(&b, t), Verdict::Healthy);
        }
    }

    #[test]
    fn a_silent_message_loop_is_a_stall() {
        let (b, mut g) = armed();
        assert_eq!(g.check(&b, 999), Verdict::Healthy);
        assert_eq!(g.check(&b, 1000), Verdict::HookThreadStalled);
        b.pump.store(1000, Relaxed);
        b.hook.store(1000, Relaxed);
        assert_eq!(g.check(&b, 1100), Verdict::Healthy);
    }

    #[test]
    fn a_disarmed_hook_is_never_judged() {
        let (b, mut g) = armed();
        b.disarm();
        assert_eq!(g.check(&b, 60_000), Verdict::Healthy);
        b.arm(60_000);
        assert_eq!(g.check(&b, 60_050), Verdict::Healthy);
    }
}
