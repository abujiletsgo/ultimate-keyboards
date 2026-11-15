//! Home-row-mod misfire protection: typing-streak guard, opposite-hand hold, per-key time.
use serde_json::{json, Value};
use ultimate_keyboards_engine::{key_name_to_usage, Engine, KeyEvent, OutputEvent, Profile};

fn engine(profile: Value) -> Engine {
    Engine::new(serde_json::from_value::<Profile>(profile).unwrap()).unwrap()
}
fn hrm(from: &str, m: &str, extra: Value) -> Value {
    let mut r = json!({"type":"homerow_mod","fromKey":from,"tapKey":from,"modKey":m});
    if let Value::Object(x) = extra {
        r.as_object_mut().unwrap().extend(x);
    }
    r
}
fn ev(e: &mut Engine, k: &str, down: bool, at: u64) -> Vec<OutputEvent> {
    e.process(KeyEvent { usage: key_name_to_usage(k).unwrap(), down, at_ms: at })
}
fn out(x: &[(&str, bool)]) -> Vec<OutputEvent> {
    x.iter().map(|(k, d)| OutputEvent { usage: key_name_to_usage(k).unwrap(), down: *d }).collect()
}

#[test]
fn streak_guard_types_the_letter_mid_word_even_on_a_slow_roll() {
    // "the f..." typed fast: F pressed 40 ms after E and held 300 ms (a slow roll).
    let mut e = engine(json!({"version":1,"typingStreakMs":120,"rules":[hrm("f","left_command",json!({}))]}));
    ev(&mut e, "e", true, 0);
    ev(&mut e, "e", false, 30);
    assert_eq!(ev(&mut e, "f", true, 40), out(&[("f", true)]));
    assert!(e.tick(400).is_empty(), "no Command after the hold time");
    assert_eq!(ev(&mut e, "f", false, 400), out(&[("f", false)]));
}

#[test]
fn streak_guard_off_by_default_keeps_old_behaviour() {
    let mut e = engine(json!({"version":1,"rules":[hrm("f","left_command",json!({}))]}));
    ev(&mut e, "e", true, 0);
    ev(&mut e, "e", false, 30);
    assert!(ev(&mut e, "f", true, 40).is_empty());
    assert_eq!(e.tick(190), out(&[("left_command", true)]));
}

#[test]
fn after_a_pause_the_mod_still_holds() {
    let mut e = engine(json!({"version":1,"typingStreakMs":120,"rules":[hrm("f","left_command",json!({}))]}));
    ev(&mut e, "e", true, 0);
    ev(&mut e, "e", false, 30);
    assert!(ev(&mut e, "f", true, 500).is_empty());
    assert_eq!(e.tick(650), out(&[("left_command", true)]));
    assert_eq!(ev(&mut e, "c", true, 700), out(&[("c", true)]));
}

#[test]
fn modifier_presses_do_not_start_a_streak() {
    let mut e = engine(json!({"version":1,"typingStreakMs":120,"rules":[hrm("f","left_command",json!({}))]}));
    ev(&mut e, "left_shift", true, 0);
    assert!(ev(&mut e, "f", true, 20).is_empty(), "Shift then F is a decision, not typing");
}

#[test]
fn combo_key_that_is_also_a_home_row_mod_is_not_its_own_streak() {
    let mut e = engine(json!({"version":1,"typingStreakMs":120,"rules":[
        {"type":"combo","fromKeys":["k","l"],"toKey":"return_or_enter"},
        hrm("k","right_shift",json!({}))
    ]}));
    // K alone after a pause: the combo window passes, then K must wait as a mod, not type at once.
    assert!(ev(&mut e, "k", true, 1000).is_empty());
    assert!(e.tick(1060).is_empty());
    assert_eq!(e.tick(1200), out(&[("right_shift", true)]));
}

#[test]
fn opposite_hand_holds_early_on_other_hand_tap() {
    let mut e = engine(json!({"version":1,"rules":[hrm("f","left_command",json!({"holdBehavior":"opposite_hand"}))]}));
    assert!(ev(&mut e, "f", true, 0).is_empty());
    assert!(ev(&mut e, "j", true, 20).is_empty());
    assert_eq!(
        ev(&mut e, "j", false, 50),
        out(&[("left_command", true), ("j", true), ("j", false)])
    );
}

#[test]
fn opposite_hand_ignores_same_hand_rolls() {
    // "fd" style roll with D fully inside F: same hand, so F is a letter when released early.
    let mut e = engine(json!({"version":1,"rules":[hrm("f","left_command",json!({"holdBehavior":"opposite_hand","holdThresholdMs":250}))]}));
    assert!(ev(&mut e, "f", true, 0).is_empty());
    assert!(ev(&mut e, "d", true, 20).is_empty());
    assert!(ev(&mut e, "d", false, 50).is_empty());
    assert_eq!(
        ev(&mut e, "f", false, 80),
        out(&[("f", true), ("d", true), ("d", false), ("f", false)])
    );
}

#[test]
fn opposite_hand_same_hand_shortcut_still_works_after_hold_time() {
    let mut e = engine(json!({"version":1,"rules":[hrm("f","left_command",json!({"holdBehavior":"opposite_hand","holdThresholdMs":200}))]}));
    assert!(ev(&mut e, "f", true, 0).is_empty());
    assert_eq!(e.tick(200), out(&[("left_command", true)]));
    assert_eq!(ev(&mut e, "c", true, 220), out(&[("c", true)]));
}

#[test]
fn per_key_hold_time_overrides_profile() {
    let mut e = engine(json!({"version":1,"holdThresholdMs":150,"rules":[
        hrm("a","left_control",json!({"holdThresholdMs":300})),
        hrm("f","left_command",json!({}))
    ]}));
    assert!(ev(&mut e, "a", true, 0).is_empty());
    assert!(e.tick(200).is_empty(), "pinky waits longer");
    assert_eq!(e.tick(300), out(&[("left_control", true)]));
}

#[test]
fn invalid_values_are_rejected() {
    for p in [
        json!({"version":1,"typingStreakMs":501,"rules":[]}),
        json!({"version":1,"rules":[hrm("a","left_control",json!({"holdThresholdMs":20}))]}),
    ] {
        let profile: Profile = serde_json::from_value(p).unwrap();
        assert!(Engine::new(profile).is_err());
    }
}
