use serde_json::{json, Value};
use ultimate_keyboards_engine::{
    key_name_to_usage, Engine, HoldBehavior, KeyEvent, OutputEvent, Profile, Rule,
};

fn layer_rule(tap: bool, behavior: Option<&str>) -> Value {
    let mut rule = json!({"type":"layer_activator","fromKey":"spacebar","layerName":"nav"});
    if tap {
        rule["tapKey"] = json!("spacebar");
    }
    if let Some(value) = behavior {
        rule["holdBehavior"] = json!(value);
    }
    rule
}
fn engine(rules: Vec<Value>) -> Engine {
    Engine::new(serde_json::from_value(json!({"version":1,"rules":rules})).unwrap()).unwrap()
}
fn navigation(tap: bool, behavior: Option<&str>) -> Engine {
    engine(vec![
        layer_rule(tap, behavior),
        json!({"type":"layer_binding","layerName":"nav","fromKey":"h","toKey":"left_arrow"}),
        json!({"type":"layer_binding","layerName":"nav","fromKey":"j","toKey":"right_arrow"}),
    ])
}
fn event(e: &mut Engine, name: &str, down: bool, at_ms: u64) -> Vec<OutputEvent> {
    e.process(KeyEvent {
        usage: key_name_to_usage(name).unwrap(),
        down,
        at_ms,
    })
}
fn out(events: &[(&str, bool)]) -> Vec<OutputEvent> {
    events
        .iter()
        .map(|(name, down)| OutputEvent {
            usage: key_name_to_usage(name).unwrap(),
            down: *down,
        })
        .collect()
}

#[test]
fn dedicated_layer_is_immediate_for_every_behavior_and_releases_immediately() {
    for behavior in [
        None,
        Some("balanced"),
        Some("hold_preferred"),
        Some("tap_preferred"),
    ] {
        let mut e = navigation(false, behavior);
        assert!(event(&mut e, "spacebar", true, 0).is_empty());
        assert_eq!(
            e.next_deadline_ms(),
            None,
            "dedicated key must not start a hold timer"
        );
        assert_eq!(event(&mut e, "h", true, 1), out(&[("left_arrow", true)]));
        assert_eq!(event(&mut e, "h", false, 2), out(&[("left_arrow", false)]));
        assert!(event(&mut e, "spacebar", false, 3).is_empty());
        assert_eq!(event(&mut e, "h", true, 4), out(&[("h", true)]));
        assert_eq!(e.reset(), out(&[("h", false)]));
    }
}

#[test]
fn balanced_default_emits_navigation_at_other_release_twenty_ms() {
    let mut e = navigation(true, None);
    assert!(event(&mut e, "spacebar", true, 0).is_empty());
    assert!(event(&mut e, "h", true, 10).is_empty());
    assert_eq!(
        event(&mut e, "h", false, 20),
        out(&[("left_arrow", true), ("left_arrow", false)])
    );
    assert_eq!(e.next_deadline_ms(), None);
    assert!(event(&mut e, "spacebar", false, 30).is_empty());
    assert!(e.reset().is_empty());
}

#[test]
fn balanced_roll_leader_released_first_types_space_and_letter() {
    let mut e = navigation(true, Some("balanced"));
    event(&mut e, "spacebar", true, 0);
    event(&mut e, "h", true, 10);
    assert_eq!(
        event(&mut e, "spacebar", false, 20),
        out(&[("spacebar", true), ("h", true), ("spacebar", false)])
    );
    assert_eq!(event(&mut e, "h", false, 30), out(&[("h", false)]));
}

#[test]
fn hold_preferred_emits_at_other_down_ten_ms_and_keeps_selected_release() {
    let mut e = navigation(true, Some("hold_preferred"));
    event(&mut e, "spacebar", true, 0);
    assert_eq!(event(&mut e, "h", true, 10), out(&[("left_arrow", true)]));
    assert_eq!(e.next_deadline_ms(), None);
    assert!(event(&mut e, "spacebar", false, 20).is_empty());
    assert_eq!(event(&mut e, "h", false, 30), out(&[("left_arrow", false)]));
    assert_eq!(event(&mut e, "h", true, 40), out(&[("h", true)]));
}

#[test]
fn tap_preferred_keeps_complete_other_taps_buffered_until_leader_decides() {
    let mut e = navigation(true, Some("tap_preferred"));
    event(&mut e, "spacebar", true, 0);
    event(&mut e, "h", true, 10);
    assert!(event(&mut e, "h", false, 20).is_empty());
    assert!(e.tick(29).is_empty());
    assert_eq!(
        event(&mut e, "spacebar", false, 30),
        out(&[
            ("spacebar", true),
            ("h", true),
            ("h", false),
            ("spacebar", false)
        ])
    );
    let mut e = navigation(true, Some("tap_preferred"));
    event(&mut e, "spacebar", true, 0);
    event(&mut e, "h", true, 10);
    event(&mut e, "h", false, 20);
    assert!(e.tick(149).is_empty());
    assert_eq!(
        e.tick(150),
        out(&[("left_arrow", true), ("left_arrow", false)])
    );
    assert!(event(&mut e, "spacebar", false, 151).is_empty());
}

#[test]
fn all_tap_behaviors_preserve_alone_tap_and_exact_deadline_is_hold() {
    for behavior in [
        None,
        Some("balanced"),
        Some("hold_preferred"),
        Some("tap_preferred"),
    ] {
        let mut e = navigation(true, behavior);
        event(&mut e, "spacebar", true, 0);
        assert_eq!(
            event(&mut e, "spacebar", false, 149),
            out(&[("spacebar", true), ("spacebar", false)])
        );
        event(&mut e, "spacebar", true, 200);
        assert!(event(&mut e, "spacebar", false, 350).is_empty());
        assert!(e.reset().is_empty());
    }
}

#[test]
fn balanced_ignores_preexisting_key_release_and_repeated_downs() {
    let mut e = navigation(true, None);
    assert_eq!(event(&mut e, "h", true, 0), out(&[("h", true)]));
    event(&mut e, "spacebar", true, 10);
    assert!(event(&mut e, "h", true, 15).is_empty());
    assert!(event(&mut e, "spacebar", true, 16).is_empty());
    assert!(event(&mut e, "h", false, 20).is_empty());
    assert_eq!(e.next_deadline_ms(), Some(160));
    assert_eq!(
        event(&mut e, "spacebar", false, 30),
        out(&[("spacebar", true), ("h", false), ("spacebar", false)])
    );
    assert!(event(&mut e, "h", false, 31).is_empty());
    assert!(e.reset().is_empty());
}

#[test]
fn balanced_flushes_multiple_keys_in_order_on_first_completed_press() {
    let mut e = navigation(true, None);
    event(&mut e, "spacebar", true, 0);
    event(&mut e, "h", true, 10);
    event(&mut e, "j", true, 20);
    assert_eq!(
        event(&mut e, "j", false, 30),
        out(&[
            ("left_arrow", true),
            ("right_arrow", true),
            ("right_arrow", false)
        ])
    );
    assert_eq!(event(&mut e, "h", false, 40), out(&[("left_arrow", false)]));
    assert!(event(&mut e, "spacebar", false, 50).is_empty());
}

#[test]
fn same_timestamp_events_use_delivery_order_for_balanced_release_decision() {
    let mut held = navigation(true, None);
    event(&mut held, "spacebar", true, 0);
    event(&mut held, "h", true, 0);
    assert_eq!(
        event(&mut held, "h", false, 0),
        out(&[("left_arrow", true), ("left_arrow", false)])
    );
    assert!(event(&mut held, "spacebar", false, 0).is_empty());
    let mut roll = navigation(true, None);
    event(&mut roll, "spacebar", true, 0);
    event(&mut roll, "h", true, 0);
    assert_eq!(
        event(&mut roll, "spacebar", false, 0),
        out(&[("spacebar", true), ("h", true), ("spacebar", false)])
    );
    assert_eq!(event(&mut roll, "h", false, 0), out(&[("h", false)]));
}

#[test]
fn chronological_nested_buffer_chooses_first_decision_not_later_leader_release() {
    for (behavior, other_up_first, expected) in [
        (
            "balanced",
            true,
            out(&[
                ("a", true),
                ("left_arrow", true),
                ("left_arrow", false),
                ("a", false),
            ]),
        ),
        (
            "balanced",
            false,
            out(&[
                ("a", true),
                ("spacebar", true),
                ("h", true),
                ("spacebar", false),
                ("h", false),
                ("a", false),
            ]),
        ),
        (
            "hold_preferred",
            false,
            out(&[
                ("a", true),
                ("left_arrow", true),
                ("left_arrow", false),
                ("a", false),
            ]),
        ),
    ] {
        let mut e = engine(vec![
            json!({"type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"left_control"}),
            layer_rule(true, Some(behavior)),
            json!({"type":"layer_binding","layerName":"nav","fromKey":"h","toKey":"left_arrow"}),
        ]);
        event(&mut e, "a", true, 0);
        event(&mut e, "spacebar", true, 10);
        event(&mut e, "h", true, 20);
        let first = if other_up_first { "h" } else { "spacebar" };
        let second = if other_up_first { "spacebar" } else { "h" };
        assert!(event(&mut e, first, false, 30).is_empty());
        assert!(event(&mut e, second, false, 40).is_empty());
        assert_eq!(event(&mut e, "a", false, 50), expected);
        assert!(e.reset().is_empty());
    }
}

#[test]
fn homerow_mods_still_wait_for_threshold_after_other_key_tap() {
    let mut e = engine(vec![
        json!({"type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"left_control"}),
    ]);
    event(&mut e, "a", true, 0);
    event(&mut e, "h", true, 10);
    assert!(event(&mut e, "h", false, 20).is_empty());
    assert!(e.tick(149).is_empty());
    assert_eq!(
        e.tick(150),
        out(&[("left_control", true), ("h", true), ("h", false)])
    );
    assert_eq!(
        event(&mut e, "a", false, 151),
        out(&[("left_control", false)])
    );
}

#[test]
fn earlier_combo_wins_and_dedicated_fallback_has_no_extra_hold_timer() {
    let rules = vec![
        json!({"type":"combo","fromKeys":["spacebar","j"],"toKey":"escape"}),
        layer_rule(false, None),
        json!({"type":"layer_binding","layerName":"nav","fromKey":"h","toKey":"left_arrow"}),
    ];
    let mut chord = engine(rules.clone());
    event(&mut chord, "spacebar", true, 0);
    assert_eq!(chord.next_deadline_ms(), Some(50));
    assert_eq!(event(&mut chord, "j", true, 10), out(&[("escape", true)]));
    assert_eq!(event(&mut chord, "h", true, 20), out(&[("h", true)]));
    let mut failed = engine(rules);
    event(&mut failed, "spacebar", true, 0);
    assert_eq!(
        event(&mut failed, "h", true, 10),
        out(&[("left_arrow", true)])
    );
    assert_eq!(failed.next_deadline_ms(), None);
    assert!(event(&mut failed, "spacebar", false, 20).is_empty());
    assert_eq!(
        event(&mut failed, "h", false, 30),
        out(&[("left_arrow", false)])
    );
}

#[test]
fn delayed_combo_fallback_uses_original_leader_timestamp() {
    let mut e = engine(vec![
        json!({"type":"combo","fromKeys":["spacebar","j"],"toKey":"escape"}),
        layer_rule(true, Some("tap_preferred")),
        json!({"type":"layer_binding","layerName":"nav","fromKey":"h","toKey":"left_arrow"}),
    ]);
    event(&mut e, "spacebar", true, 0);
    assert!(e.tick(50).is_empty());
    assert_eq!(e.next_deadline_ms(), Some(150));
    event(&mut e, "h", true, 60);
    event(&mut e, "h", false, 70);
    assert!(e.tick(149).is_empty());
    assert_eq!(
        e.tick(150),
        out(&[("left_arrow", true), ("left_arrow", false)])
    );
}

#[test]
fn buffered_combo_still_uses_original_partner_timestamps() {
    let mut e = engine(vec![
        layer_rule(true, None),
        json!({"type":"combo","fromKeys":["h","j"],"toKey":"escape"}),
        json!({"type":"layer_binding","layerName":"nav","fromKey":"h","toKey":"left_arrow"}),
        json!({"type":"layer_binding","layerName":"nav","fromKey":"j","toKey":"right_arrow"}),
    ]);
    event(&mut e, "spacebar", true, 0);
    event(&mut e, "h", true, 10);
    event(&mut e, "j", true, 70);
    // The presses were 60 ms apart, so replay must not turn them into a combo.
    assert_eq!(
        event(&mut e, "j", false, 80),
        out(&[
            ("left_arrow", true),
            ("right_arrow", true),
            ("right_arrow", false)
        ])
    );
    assert_eq!(event(&mut e, "h", false, 90), out(&[("left_arrow", false)]));
}

#[test]
fn earlier_simple_rule_still_wins_over_dedicated_layer() {
    let mut e = engine(vec![
        json!({"type":"simple","fromKey":"spacebar","toKey":"tab"}),
        layer_rule(false, None),
        json!({"type":"layer_binding","layerName":"nav","fromKey":"h","toKey":"left_arrow"}),
    ]);
    assert_eq!(event(&mut e, "spacebar", true, 0), out(&[("tab", true)]));
    assert_eq!(event(&mut e, "h", true, 1), out(&[("h", true)]));
    assert_eq!(event(&mut e, "spacebar", false, 2), out(&[("tab", false)]));
}

#[test]
fn dedicated_and_balanced_activators_share_layer_reference_ownership() {
    let mut e = engine(vec![
        layer_rule(false, None),
        json!({"type":"layer_activator","fromKey":"tab","tapKey":"tab","layerName":"nav"}),
        json!({"type":"layer_binding","layerName":"nav","fromKey":"h","toKey":"left_arrow"}),
    ]);
    event(&mut e, "spacebar", true, 0);
    event(&mut e, "tab", true, 5);
    event(&mut e, "h", true, 10);
    assert_eq!(
        event(&mut e, "h", false, 15),
        out(&[("left_arrow", true), ("left_arrow", false)])
    );
    assert!(event(&mut e, "spacebar", false, 20).is_empty());
    assert!(event(&mut e, "spacebar", false, 21).is_empty());
    assert_eq!(event(&mut e, "h", true, 25), out(&[("left_arrow", true)]));
    event(&mut e, "h", false, 26);
    event(&mut e, "tab", false, 30);
    assert_eq!(event(&mut e, "h", true, 40), out(&[("h", true)]));
}

#[test]
fn reset_discards_pending_layer_and_releases_early_hold_output() {
    let mut e = navigation(true, None);
    event(&mut e, "spacebar", true, 0);
    event(&mut e, "h", true, 10);
    assert!(e.reset().is_empty());
    assert!(event(&mut e, "h", false, 11).is_empty());
    assert_eq!(event(&mut e, "h", true, 12), out(&[("h", true)]));
    e.reset();
    event(&mut e, "spacebar", true, 20);
    event(&mut e, "h", true, 30);
    event(&mut e, "j", true, 40);
    assert_eq!(
        event(&mut e, "j", false, 50),
        out(&[
            ("left_arrow", true),
            ("right_arrow", true),
            ("right_arrow", false)
        ])
    );
    assert_eq!(e.reset(), out(&[("left_arrow", false)]));
    assert_eq!(e.next_deadline_ms(), None);
    assert_eq!(event(&mut e, "h", true, 60), out(&[("h", true)]));
}

#[test]
fn v1_defaults_balanced_and_rejects_unknown_behavior_values() {
    let profile: Profile =
        serde_json::from_value(json!({"version":1,"rules":[layer_rule(true,None)]})).unwrap();
    assert!(matches!(
        profile.rules[0],
        Rule::LayerActivator {
            hold_behavior: HoldBehavior::Balanced,
            ..
        }
    ));
    let round_trip = serde_json::to_value(profile).unwrap();
    assert_eq!(round_trip["rules"][0]["holdBehavior"], "balanced");
    for value in [
        json!("unknown"),
        json!("Balanced"),
        json!("hold-preferred"),
        json!(null),
        json!(42),
    ] {
        let mut rule = layer_rule(true, None);
        rule["holdBehavior"] = value;
        assert!(serde_json::from_value::<Profile>(json!({"version":1,"rules":[rule]})).is_err());
    }
    assert!(serde_json::from_value::<Profile>(json!({"version":1,"rules":[{
        "type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"left_control","holdBehavior":"balanced"
    }]})).is_err());
}

#[test]
fn nested_distinct_layers_release_independently_and_keep_held_key_action() {
    let mut e = engine(vec![
        layer_rule(false, None),
        json!({"type":"layer_activator","fromKey":"tab","tapKey":"tab","layerName":"numbers"}),
        json!({"type":"layer_binding","layerName":"numbers","fromKey":"h","toKey":"1"}),
        json!({"type":"layer_binding","layerName":"nav","fromKey":"h","toKey":"left_arrow"}),
    ]);
    event(&mut e, "spacebar", true, 0);
    event(&mut e, "tab", true, 5);
    event(&mut e, "h", true, 10);
    assert_eq!(
        event(&mut e, "h", false, 15),
        out(&[("1", true), ("1", false)])
    );
    assert_eq!(event(&mut e, "h", true, 25), out(&[("1", true)]));
    assert!(event(&mut e, "tab", false, 26).is_empty());
    assert_eq!(event(&mut e, "h", false, 27), out(&[("1", false)]));
    assert_eq!(event(&mut e, "h", true, 28), out(&[("left_arrow", true)]));
    assert!(event(&mut e, "spacebar", false, 29).is_empty());
    assert_eq!(event(&mut e, "h", false, 30), out(&[("left_arrow", false)]));
    assert_eq!(event(&mut e, "h", true, 31), out(&[("h", true)]));
}
