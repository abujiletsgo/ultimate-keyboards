use ultimate_keyboards_engine::{key_name_to_usage, Engine, KeyEvent, OutputEvent};

const HYPER: &str = r#"[{"type":"homerow_mod","fromKey":"caps_lock","tapKey":"escape","modKey":"hyper"}]"#;
const HYPER_HOME: &str = r#"[
 {"type":"homerow_mod","fromKey":"caps_lock","tapKey":"escape","modKey":"hyper"},
 {"type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"left_control"}
]"#;

fn engine(rules: &str) -> Engine {
    let json = format!(r#"{{"version":1,"typingStreakMs":150,"rules":{rules}}}"#);
    Engine::new(serde_json::from_str(&json).unwrap()).unwrap()
}
fn usage(k: &str) -> u16 {
    key_name_to_usage(k).unwrap()
}
fn event(e: &mut Engine, k: &str, down: bool, at_ms: u64) -> Vec<OutputEvent> {
    e.process(KeyEvent { usage: usage(k), down, at_ms })
}
fn expected(events: &[(&str, bool)]) -> Vec<OutputEvent> {
    events
        .iter()
        .map(|(k, down)| OutputEvent { usage: usage(k), down: *down })
        .collect()
}
const ALL_DOWN: [(&str, bool); 4] = [
    ("left_control", true),
    ("left_shift", true),
    ("left_option", true),
    ("left_command", true),
];
const ALL_UP: [(&str, bool); 4] = [
    ("left_command", false),
    ("left_option", false),
    ("left_shift", false),
    ("left_control", false),
];

#[test]
fn hyper_tap_is_escape() {
    let mut e = engine(HYPER);
    assert!(event(&mut e, "caps_lock", true, 0).is_empty());
    assert_eq!(event(&mut e, "caps_lock", false, 60), expected(&[("escape", true), ("escape", false)]));
}

#[test]
fn hyper_hold_past_threshold_presses_all_four_modifiers() {
    let mut e = engine(HYPER);
    event(&mut e, "caps_lock", true, 0);
    assert_eq!(e.tick(150), expected(&ALL_DOWN));
    assert_eq!(event(&mut e, "caps_lock", false, 400), expected(&ALL_UP));
}

#[test]
fn hyper_with_another_key_holds_at_once_and_keeps_the_key() {
    let mut e = engine(HYPER);
    event(&mut e, "caps_lock", true, 0);
    let mut got = event(&mut e, "j", true, 30);
    assert_eq!(got.split_off(4), expected(&[("j", true)]));
    assert_eq!(got, expected(&ALL_DOWN));
    assert_eq!(event(&mut e, "j", false, 80), expected(&[("j", false)]));
    assert_eq!(event(&mut e, "caps_lock", false, 120), expected(&ALL_UP));
}

#[test]
fn hyper_pressed_mid_typing_is_still_hyper() {
    let mut e = engine(HYPER_HOME);
    event(&mut e, "x", true, 0);
    event(&mut e, "x", false, 20);
    // Within the typing streak a home-row letter would type itself; Caps must not.
    assert!(event(&mut e, "caps_lock", true, 40).is_empty());
    let got = event(&mut e, "k", true, 60);
    assert_eq!(got[..4], expected(&ALL_DOWN)[..]);
}

#[test]
fn hyper_reset_releases_everything() {
    let mut e = engine(HYPER);
    event(&mut e, "caps_lock", true, 0);
    e.tick(200);
    let out = e.reset();
    assert_eq!(out.len(), 4);
    assert!(out.iter().all(|o| !o.down));
}

#[test]
fn hyper_is_only_a_modkey_value_so_old_profiles_are_unchanged() {
    let mut e = engine(r#"[{"type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"left_control"}]"#);
    event(&mut e, "a", true, 0);
    assert_eq!(event(&mut e, "a", false, 20), expected(&[("a", true), ("a", false)]));
}
