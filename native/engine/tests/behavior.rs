use ultimate_keyboards_engine::{key_name_to_usage, Engine, KeyEvent, OutputEvent, Profile};

fn engine(rules: &str) -> Engine {
    Engine::new(serde_json::from_str(&format!(r#"{{"version":1,"rules":{rules}}}"#)).unwrap())
        .unwrap()
}
fn usage(k: &str) -> u16 {
    key_name_to_usage(k).unwrap()
}
fn event(e: &mut Engine, k: &str, down: bool, at_ms: u64) -> Vec<OutputEvent> {
    e.process(KeyEvent {
        usage: usage(k),
        down,
        at_ms,
    })
}
fn expected(events: &[(&str, bool)]) -> Vec<OutputEvent> {
    events
        .iter()
        .map(|(k, down)| OutputEvent {
            usage: usage(k),
            down: *down,
        })
        .collect()
}
const HOME: &str = r#"[{"type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"left_control"}]"#;
const COMBO: &str = r#"[{"type":"combo","fromKeys":["j","k"],"toKey":"escape"}]"#;
const LAYER: &str = r#"[
 {"type":"layer_activator","fromKey":"spacebar","layerName":"nav","tapKey":"spacebar"},
 {"type":"layer_binding","layerName":"nav","fromKey":"h","toKey":"left_arrow","toModifiers":["shift"]}
]"#;

#[test]
fn passthrough_duplicates_and_monotonic_clock() {
    let mut e = engine("[]");
    assert_eq!(event(&mut e, "a", true, 10), expected(&[("a", true)]));
    assert!(event(&mut e, "a", true, 11).is_empty());
    assert_eq!(event(&mut e, "a", false, 9), expected(&[("a", false)]));
    assert!(event(&mut e, "a", false, 12).is_empty());
    assert!(e.reset().is_empty());
}

#[test]
fn simple_modifiers_match_either_side_and_preserve_physical_modifier() {
    let mut e = engine(
        r#"[{"type":"simple","fromKey":"a","fromModifiers":["control"],"toKey":"b","toModifiers":["shift"]}]"#,
    );
    assert_eq!(event(&mut e, "a", true, 0), expected(&[("a", true)]));
    event(&mut e, "a", false, 1);
    assert_eq!(
        event(&mut e, "right_control", true, 2),
        expected(&[("right_control", true)])
    );
    assert_eq!(
        event(&mut e, "a", true, 3),
        expected(&[("left_shift", true), ("b", true)])
    );
    assert_eq!(
        event(&mut e, "a", false, 4),
        expected(&[("b", false), ("left_shift", false)])
    );
    assert_eq!(
        event(&mut e, "right_control", false, 5),
        expected(&[("right_control", false)])
    );
}

#[test]
fn shared_generated_and_physical_modifier_references_survive_release_order() {
    let mut e = engine(
        r#"[
      {"type":"simple","fromKey":"a","toKey":"b","toModifiers":["shift"]},
      {"type":"simple","fromKey":"c","toKey":"d","toModifiers":["shift"]}
    ]"#,
    );
    event(&mut e, "left_shift", true, 0);
    assert_eq!(event(&mut e, "a", true, 1), expected(&[("b", true)]));
    assert_eq!(event(&mut e, "c", true, 2), expected(&[("d", true)]));
    assert!(event(&mut e, "left_shift", false, 3).is_empty());
    assert_eq!(event(&mut e, "a", false, 4), expected(&[("b", false)]));
    assert_eq!(
        event(&mut e, "c", false, 5),
        expected(&[("d", false), ("left_shift", false)])
    );
    assert!(e.reset().is_empty());
}

#[test]
fn homerow_tap_and_roll_preserve_event_order() {
    let mut e = engine(HOME);
    assert!(event(&mut e, "a", true, 0).is_empty());
    assert_eq!(e.next_deadline_ms(), Some(150));
    assert!(event(&mut e, "b", true, 20).is_empty());
    assert_eq!(
        event(&mut e, "a", false, 40),
        expected(&[("a", true), ("b", true), ("a", false)])
    );
    assert_eq!(event(&mut e, "b", false, 60), expected(&[("b", false)]));
    assert_eq!(e.next_deadline_ms(), None);
    assert!(e.reset().is_empty());
}

#[test]
fn homerow_hold_applies_to_buffered_key_and_no_tap_leaks() {
    let mut e = engine(HOME);
    event(&mut e, "a", true, 0);
    event(&mut e, "b", true, 20);
    assert!(e.tick(149).is_empty());
    assert_eq!(
        e.tick(150),
        expected(&[("left_control", true), ("b", true)])
    );
    assert_eq!(
        event(&mut e, "a", false, 160),
        expected(&[("left_control", false)])
    );
    assert_eq!(event(&mut e, "b", false, 180), expected(&[("b", false)]));
    assert!(e.reset().is_empty());
}

#[test]
fn buffered_complete_key_tap_retains_order() {
    let mut e = engine(HOME);
    event(&mut e, "a", true, 0);
    event(&mut e, "b", true, 10);
    event(&mut e, "b", false, 20);
    assert_eq!(
        event(&mut e, "a", false, 40),
        expected(&[("a", true), ("b", true), ("b", false), ("a", false)])
    );
}

#[test]
fn dual_roles_in_a_roll_both_emit_letters() {
    let mut e = engine(
        r#"[
     {"type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"left_control"},
     {"type":"homerow_mod","fromKey":"s","tapKey":"s","modKey":"left_option"}
    ]"#,
    );
    event(&mut e, "a", true, 0);
    event(&mut e, "s", true, 10);
    assert_eq!(event(&mut e, "a", false, 20), expected(&[("a", true)]));
    assert_eq!(
        event(&mut e, "s", false, 30),
        expected(&[("s", true), ("a", false), ("s", false)])
    );
    assert!(e.reset().is_empty());
}

#[test]
fn exact_hold_boundary_is_hold() {
    let mut e = engine(HOME);
    event(&mut e, "a", true, 0);
    assert_eq!(
        event(&mut e, "a", false, 150),
        expected(&[("left_control", true), ("left_control", false)])
    );
}

#[test]
fn layer_tap_hold_and_release_do_not_change_already_held_binding() {
    let mut e = engine(LAYER);
    event(&mut e, "spacebar", true, 0);
    assert_eq!(
        event(&mut e, "spacebar", false, 30),
        expected(&[("spacebar", true), ("spacebar", false)])
    );
    event(&mut e, "spacebar", true, 100);
    event(&mut e, "h", true, 120);
    assert_eq!(
        e.tick(250),
        expected(&[("left_shift", true), ("left_arrow", true)])
    );
    assert!(event(&mut e, "spacebar", false, 260).is_empty());
    assert_eq!(
        event(&mut e, "h", false, 270),
        expected(&[("left_arrow", false), ("left_shift", false)])
    );
    assert_eq!(event(&mut e, "h", true, 280), expected(&[("h", true)]));
}

#[test]
fn same_layer_two_activators_reference_count() {
    let mut e = engine(
        r#"[
      {"type":"layer_activator","fromKey":"spacebar","layerName":"nav"},
      {"type":"layer_activator","fromKey":"tab","layerName":"nav"},
      {"type":"layer_binding","layerName":"nav","fromKey":"h","toKey":"left_arrow"}
    ]"#,
    );
    event(&mut e, "spacebar", true, 0);
    event(&mut e, "tab", true, 1);
    assert_eq!(e.next_deadline_ms(), None);
    event(&mut e, "spacebar", false, 2);
    assert_eq!(
        event(&mut e, "h", true, 3),
        expected(&[("left_arrow", true)])
    );
    event(&mut e, "h", false, 4);
    event(&mut e, "tab", false, 5);
    assert_eq!(event(&mut e, "h", true, 6), expected(&[("h", true)]));
}

#[test]
fn combo_success_both_orders_and_hold_until_last_release() {
    for (a, b) in [("j", "k"), ("k", "j")] {
        let mut e = engine(COMBO);
        assert!(event(&mut e, a, true, 0).is_empty());
        assert_eq!(event(&mut e, b, true, 20), expected(&[("escape", true)]));
        assert!(event(&mut e, a, false, 30).is_empty());
        assert_eq!(event(&mut e, b, false, 40), expected(&[("escape", false)]));
        assert!(e.reset().is_empty());
    }
}

#[test]
fn combo_timeout_and_late_partner_pass_through() {
    let mut e = engine(COMBO);
    event(&mut e, "j", true, 0);
    assert_eq!(e.next_deadline_ms(), Some(50));
    assert_eq!(e.tick(50), expected(&[("j", true)]));
    assert!(event(&mut e, "k", true, 60).is_empty());
    assert_eq!(
        event(&mut e, "j", false, 70),
        expected(&[("k", true), ("j", false)])
    );
    assert_eq!(event(&mut e, "k", false, 80), expected(&[("k", false)]));
}

#[test]
fn combo_failure_unrelated_key_does_not_reorder_typing() {
    let mut e = engine(COMBO);
    event(&mut e, "j", true, 0);
    assert_eq!(
        event(&mut e, "x", true, 10),
        expected(&[("j", true), ("x", true)])
    );
    assert_eq!(event(&mut e, "j", false, 20), expected(&[("j", false)]));
    assert_eq!(event(&mut e, "x", false, 30), expected(&[("x", false)]));
}

#[test]
fn combo_release_before_completion_emits_tap() {
    let mut e = engine(COMBO);
    event(&mut e, "j", true, 0);
    assert_eq!(
        event(&mut e, "j", false, 10),
        expected(&[("j", true), ("j", false)])
    );
    assert!(e.reset().is_empty());
}

#[test]
fn combo_overlapping_candidates_choose_completed_rule() {
    let mut e = engine(
        r#"[
     {"type":"combo","fromKeys":["i","u"],"toKey":"escape"},
     {"type":"combo","fromKeys":["i","o"],"toKey":"tab"}
    ]"#,
    );
    event(&mut e, "i", true, 0);
    assert_eq!(event(&mut e, "o", true, 10), expected(&[("tab", true)]));
    event(&mut e, "i", false, 20);
    assert_eq!(event(&mut e, "o", false, 30), expected(&[("tab", false)]));
    assert!(e.reset().is_empty());
}

#[test]
fn layer_rules_before_combos_take_precedence() {
    let mut e = engine(
        r#"[
     {"type":"layer_activator","fromKey":"spacebar","layerName":"n"},
     {"type":"layer_binding","fromKey":"j","layerName":"n","toKey":"1"},
     {"type":"combo","fromKeys":["j","k"],"toKey":"escape"}
    ]"#,
    );
    event(&mut e, "spacebar", true, 0);
    e.tick(150);
    assert_eq!(event(&mut e, "j", true, 160), expected(&[("1", true)]));
    event(&mut e, "k", true, 170);
    assert_eq!(e.tick(220), expected(&[("k", true)]));
}

#[test]
fn combo_fallback_can_be_dual_role_without_losing_tap() {
    let mut e = engine(
        r#"[
     {"type":"combo","fromKeys":["a","s"],"toKey":"escape"},
     {"type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"left_control"}
    ]"#,
    );
    event(&mut e, "a", true, 0);
    assert!(e.tick(50).is_empty());
    assert_eq!(e.next_deadline_ms(), Some(150));
    assert_eq!(
        event(&mut e, "a", false, 70),
        expected(&[("a", true), ("a", false)])
    );
}

#[test]
fn reset_releases_key_before_modifiers_and_discards_pending() {
    let mut e = engine(
        r#"[
     {"type":"simple","fromKey":"x","toKey":"b","toModifiers":["shift"]},
     {"type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"left_control"}
    ]"#,
    );
    event(&mut e, "x", true, 0);
    event(&mut e, "a", true, 10);
    assert_eq!(e.reset(), expected(&[("b", false), ("left_shift", false)]));
    assert!(e.tick(1000).is_empty());
    assert!(e.reset().is_empty());
    assert!(event(&mut e, "x", false, 1001).is_empty());
    assert_eq!(
        event(&mut e, "x", true, 1002),
        expected(&[("left_shift", true), ("b", true)])
    );
}

#[test]
fn reload_old_engine_reset_clears_combo_and_hold_outputs() {
    for rules in [HOME, COMBO] {
        let mut e = engine(rules);
        if rules == HOME {
            event(&mut e, "a", true, 0);
            e.tick(150);
        } else {
            event(&mut e, "j", true, 0);
            event(&mut e, "k", true, 10);
        }
        let ups = e.reset();
        assert_eq!(ups.len(), 1);
        assert!(!ups[0].down);
        assert_eq!(e.next_deadline_ms(), None);
        assert!(e.reset().is_empty());
        let mut replacement = engine("[]");
        assert_eq!(
            event(&mut replacement, "x", true, 160),
            expected(&[("x", true)])
        );
    }
}

#[test]
fn profile_validation_and_serde_defaults() {
    let p: Profile = serde_json::from_str(r#"{"version":1,"rules":[]}"#).unwrap();
    assert_eq!(p.hold_threshold_ms, 150);
    assert_eq!(p.combo_window_ms, 50);
    let mut p = p;
    p.version = 2;
    assert!(Engine::new(p.clone()).is_err());
    p.version = 1;
    p.hold_threshold_ms = 1;
    assert!(Engine::new(p.clone()).is_err());
    p.hold_threshold_ms = 150;
    p.combo_window_ms = 999;
    assert!(Engine::new(p).is_err());
    for rules in [
        r#"[{"type":"simple","fromKey":"fn","toKey":"a"}]"#,
        r#"[{"type":"simple","fromKey":"a","toKey":"b","toModifiers":["fn"]}]"#,
        r#"[{"type":"combo","fromKeys":["a","a"],"toKey":"b"}]"#,
        r#"[{"type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"b"}]"#,
    ] {
        let p: Profile =
            serde_json::from_str(&format!(r#"{{"version":1,"rules":{rules}}}"#)).unwrap();
        assert!(Engine::new(p).is_err());
    }
    assert!(key_name_to_usage("fn").is_none());
}

#[test]
fn deterministic_mixed_stream_never_emits_unbalanced_or_stuck_usages() {
    let rules = r#"[
      {"type":"combo","fromKeys":["j","k"],"toKey":"escape","toModifiers":["shift"]},
      {"type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"left_control"},
      {"type":"layer_activator","fromKey":"spacebar","layerName":"n","tapKey":"spacebar"},
      {"type":"layer_binding","layerName":"n","fromKey":"j","toKey":"1"},
      {"type":"simple","fromKey":"b","toKey":"c","toModifiers":["control"]}
    ]"#;
    let mut e = engine(rules);
    let keys = [
        "a",
        "b",
        "j",
        "k",
        "spacebar",
        "left_control",
        "left_shift",
        "x",
    ];
    let mut held = std::collections::BTreeSet::new();
    let mut emitted = std::collections::BTreeSet::new();
    let mut seed = 42u64;
    let mut now = 0;
    for i in 0..5000 {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        let k = keys[(seed >> 32) as usize % keys.len()];
        now += (seed >> 48) % 70;
        let down = !held.remove(k);
        if down {
            held.insert(k);
        }
        let mut outputs = event(&mut e, k, down, now);
        if i % 71 == 0 {
            outputs.extend(e.reset());
            held.clear();
        }
        for o in outputs {
            if o.down {
                assert!(emitted.insert(o.usage), "duplicate emitted down");
            } else {
                assert!(emitted.remove(&o.usage), "release without down");
            }
        }
    }
    for o in e.reset() {
        assert!(!o.down);
        assert!(emitted.remove(&o.usage));
    }
    assert!(emitted.is_empty());
}

#[test]
fn layer_rolling_tap_keeps_space_before_next_letter() {
    let mut e = engine(LAYER);
    event(&mut e, "spacebar", true, 0);
    event(&mut e, "h", true, 10);
    assert_eq!(
        event(&mut e, "spacebar", false, 20),
        expected(&[("spacebar", true), ("h", true), ("spacebar", false)])
    );
    assert_eq!(event(&mut e, "h", false, 30), expected(&[("h", false)]));
}

#[test]
fn combo_boundary_excludes_partner_at_deadline() {
    let mut e = engine(COMBO);
    event(&mut e, "j", true, 0);
    assert_eq!(event(&mut e, "k", true, 50), expected(&[("j", true)]));
    assert_eq!(e.tick(100), expected(&[("k", true)]));
    assert_eq!(e.reset(), expected(&[("j", false), ("k", false)]));
}

#[test]
fn three_key_combo_and_shorter_completed_subset() {
    let mut e = engine(r#"[{"type":"combo","fromKeys":["j","k","l"],"toKey":"escape"}]"#);
    event(&mut e, "l", true, 0);
    event(&mut e, "j", true, 10);
    assert_eq!(event(&mut e, "k", true, 20), expected(&[("escape", true)]));
    assert!(event(&mut e, "j", false, 30).is_empty());
    assert!(event(&mut e, "l", false, 40).is_empty());
    assert_eq!(
        event(&mut e, "k", false, 50),
        expected(&[("escape", false)])
    );
    let mut e = engine(
        r#"[
      {"type":"combo","fromKeys":["j","k","l"],"toKey":"escape"},
      {"type":"combo","fromKeys":["j","k"],"toKey":"tab"}
    ]"#,
    );
    event(&mut e, "j", true, 0);
    assert_eq!(event(&mut e, "k", true, 10), expected(&[("tab", true)]));
    event(&mut e, "l", true, 20);
    assert_eq!(e.tick(70), expected(&[("l", true)]));
    assert_eq!(e.reset(), expected(&[("l", false), ("tab", false)]));
}

#[test]
fn custom_timing_fields_round_trip_and_drive_deadline() {
    let p: Profile = serde_json::from_str(&format!(
        r#"{{"version":1,"holdThresholdMs":200,"comboWindowMs":75,"rules":{HOME}}}"#
    ))
    .unwrap();
    let p: Profile = serde_json::from_str(&serde_json::to_string(&p).unwrap()).unwrap();
    let mut e = Engine::new(p).unwrap();
    event(&mut e, "a", true, 10);
    assert_eq!(e.next_deadline_ms(), Some(210));
    assert!(e.tick(209).is_empty());
    assert_eq!(e.tick(210), expected(&[("left_control", true)]));
}
