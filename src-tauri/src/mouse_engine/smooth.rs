//! Platform-free scroll smoother.
//!
//! Each wheel notch adds a target distance. Every tick we emit a fixed fraction
//! of what is left (exponential ease-out), so the step size only ever shrinks
//! and fast spinning adds to the remainder instead of queueing. Fractions are
//! carried between ticks and flushed at the end, so the integer total emitted
//! equals the (rounded) total requested.

/// Output tick: 120 Hz.
pub const TICK_SECS: f64 = 1.0 / 120.0;
/// Ease-out time constant. About 4.6 time constants bring a notch under half a
/// unit, so a single notch settles in roughly 210 ms.
const TAU_SECS: f64 = 0.045;
/// Hard stop: whatever is left this long after the last input is flushed.
const MAX_SECS: f64 = 0.25;
/// Below this much remaining distance the animation is finished.
const EPSILON: f64 = 0.5;

#[derive(Default)]
pub struct Smoother {
    remaining: f64,
    /// Fraction not yet emitted as an integer.
    carry: f64,
    since_input: f64,
}

impl Smoother {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_idle(&self) -> bool {
        self.remaining == 0.0 && self.carry == 0.0
    }

    /// Add `distance` (signed). Opposite direction cancels what is left.
    pub fn add(&mut self, distance: f64) {
        if distance * self.remaining < 0.0 {
            self.remaining = 0.0;
            self.carry = 0.0;
        }
        self.remaining += distance;
        self.since_input = 0.0;
    }

    /// Drop everything still pending.
    pub fn clear(&mut self) {
        *self = Self::default();
    }

    /// Ideal (fractional) step for one tick of `dt` seconds.
    pub fn step(&mut self, dt: f64) -> f64 {
        if self.remaining == 0.0 {
            return 0.0;
        }
        self.since_input += dt;
        let step = if self.remaining.abs() < EPSILON || self.since_input >= MAX_SECS {
            self.remaining
        } else {
            self.remaining * (1.0 - (-dt / TAU_SECS).exp())
        };
        self.remaining -= step;
        if self.remaining.abs() < 1e-9 {
            self.remaining = 0.0;
        }
        step
    }

    /// Integer step for one tick; the fraction stays in the carry. When the
    /// animation ends the leftover carry is rounded out.
    pub fn tick(&mut self, dt: f64) -> i32 {
        self.carry += self.step(dt);
        let out = if self.remaining == 0.0 {
            self.carry.round()
        } else {
            self.carry.trunc()
        };
        self.carry -= out;
        if self.remaining == 0.0 {
            self.carry = 0.0;
        }
        out as i32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(s: &mut Smoother) -> Vec<i32> {
        let mut v = Vec::new();
        for _ in 0..200 {
            v.push(s.tick(TICK_SECS));
            if s.is_idle() {
                break;
            }
        }
        v
    }

    #[test]
    fn conserves_total() {
        for total in [120.0, 48.0, 7.0, -96.0, 1000.0] {
            let mut s = Smoother::new();
            s.add(total);
            assert_eq!(run(&mut s).iter().sum::<i32>(), total as i32);
        }
        // Several notches landing mid-animation.
        let mut s = Smoother::new();
        let mut sum = 0;
        for i in 0..5 {
            s.add(48.0);
            for _ in 0..(i + 1) {
                sum += s.tick(TICK_SECS);
            }
        }
        sum += run(&mut s).iter().sum::<i32>();
        assert_eq!(sum, 240);
    }

    #[test]
    fn fractional_total_rounds_once() {
        let mut s = Smoother::new();
        s.add(48.0 * 1.3);
        assert_eq!(run(&mut s).iter().sum::<i32>(), 62);
    }

    #[test]
    fn direction_change_cancels_remaining() {
        let mut s = Smoother::new();
        s.add(120.0);
        let first = s.tick(TICK_SECS);
        s.add(-48.0);
        let rest: i32 = run(&mut s).iter().sum();
        assert!(first > 0);
        assert_eq!(rest, -48);
    }

    #[test]
    fn steps_shrink_monotonically() {
        let mut s = Smoother::new();
        s.add(120.0);
        let mut last = f64::MAX;
        while !s.is_idle() {
            let st = s.step(TICK_SECS);
            if st == 0.0 {
                break;
            }
            // The final sub-half-unit flush may exceed the tail step.
            if st.abs() >= 0.5 {
                assert!(st.abs() <= last + 1e-9, "{st} > {last}");
            }
            last = st.abs();
        }
    }

    #[test]
    fn stops_within_duration() {
        let mut s = Smoother::new();
        s.add(5000.0);
        let ticks = run(&mut s).len();
        assert!(ticks as f64 * TICK_SECS <= MAX_SECS + TICK_SECS, "{ticks} ticks");
        let mut s = Smoother::new();
        s.add(120.0);
        assert!(run(&mut s).len() as f64 * TICK_SECS < 0.26);
    }

    #[test]
    fn fast_spin_accelerates() {
        let mut one = Smoother::new();
        one.add(48.0);
        let single = one.tick(TICK_SECS);
        let mut many = Smoother::new();
        for _ in 0..4 {
            many.add(48.0);
        }
        assert!(many.tick(TICK_SECS) > single * 3);
    }
}
