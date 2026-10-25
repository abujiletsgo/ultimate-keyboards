# Native remapping engine

Pure Rust, device-local USB keyboard remapping. The library has no macOS, event
tap, HID-driver, network, filesystem, or service dependency. Production hardware
capture and virtual-HID delivery require separate runtime verification.

```rust
use ultimate_keyboards_engine::{Engine, KeyEvent, Profile};

let mut engine = Engine::new(Profile::default()).unwrap();
let outputs = engine.process(KeyEvent { usage: 4, down: true, at_ms: 0 });
assert_eq!(outputs[0].usage, 4);
assert!(outputs[0].down);
```

## Public interface

- `Profile`: serde Serialize/Deserialize; `version: u32`, `title: String`,
  `rules: Vec<Rule>`, `hold_threshold_ms: u64`, `combo_window_ms: u64`.
- `Rule`: serde tagged enum mirroring the frontend's five existing rule types.
- `HoldBehavior`: `Balanced` (default), `HoldPreferred`, or `TapPreferred`;
  serialized as `balanced`, `hold_preferred`, or `tap_preferred`.
- `Engine::new(Profile) -> Result<Engine, ProfileError>` validates the profile.
- `Engine::process(KeyEvent) -> Vec<OutputEvent>` accepts a physical transition.
- `Engine::tick(now_ms: u64) -> Vec<OutputEvent>` resolves timed decisions.
- `Engine::next_deadline_ms() -> Option<u64>` supplies the next required tick.
- `Engine::reset() -> Vec<OutputEvent>` releases emitted keys and clears input,
  layers, combos, and pending decisions. It retains the monotonic clock.
- `KeyEvent { usage: u16, down: bool, at_ms: u64 }`.
- `OutputEvent { usage: u16, down: bool }`.
- `key_name_to_usage(&str) -> Option<u16>` maps supported names to USB page 7.

All struct fields above are public. `ProfileError` implements Display and Error.
`Profile::default()` is an empty version-1 passthrough profile. Profiles and rules
reject unknown JSON fields. Existing optional descriptions may be omitted.

```json
{
  "version": 1,
  "title": "My keyboard",
  "holdThresholdMs": 150,
  "comboWindowMs": 50,
  "rules": [
    {"type": "simple", "fromKey": "caps_lock", "toKey": "escape"},
    {"type": "combo", "fromKeys": ["j", "k"], "toKey": "tab"},
    {"type": "homerow_mod", "fromKey": "a", "tapKey": "a", "modKey": "left_control"},
    {"type": "layer_activator", "fromKey": "spacebar", "layerName": "nav", "tapKey": "spacebar", "holdBehavior": "balanced"},
    {"type": "layer_binding", "layerName": "nav", "fromKey": "h", "toKey": "left_arrow", "toModifiers": ["shift"]}
  ]
}
```

Timing fields default to 150/50 ms. Valid ranges are 50–1000 ms for hold and
10–200 ms for combos; profiles allow at most 1024 rules, combos 2–8 distinct
keys, and layer names 1–64 bytes with non-whitespace content. `version` and
`rules` are required. `title` defaults to an empty string.

## Runtime contract

Create one engine per physical keyboard. Supply monotonic milliseconds from the
same clock for input and ticks, and service `next_deadline_ms()` even when input
is idle. Backward timestamps are clamped. Duplicate downs/releases are ignored;
host key repeat comes from the held virtual-HID state. Input usages outside
4–231 are ignored. The runtime must filter by keyboard usage page before calling
the engine; page numbers are not encoded in `usage`.

**Apply every returned transition in order and submit the corresponding HID
report after each transition.** A tap can return down and up in one vector;
collapsing it into a final report loses the tap. Output references are balanced
within each engine. The runtime must also reference-count usages across devices
before updating the shared virtual keyboard. Do not collapse transitions from
different physical keyboards into a single source.

Before unplug, capture stop, shutdown, or profile replacement, deliver all
`reset()` releases. Validate a replacement before resetting the old engine.
Pressed keys remaining physically held after reset stay released virtually until
pressed again; the runtime must not replay a stale held-key snapshot as new input.

## Defined behavior

Rules are evaluated in profile order for each new key. The first eligible rule
wins. An active layer binding before a combo takes precedence for its first
input key. A combo tests subsequent combo rules containing that first key as
alternatives. The first complete chord wins immediately; a longer superset is
not awaited. Ties use profile order. All constituents must be depressed in the
half-open interval `[firstDown, firstDown + comboWindowMs)`, without intervening
unrelated keys or releases. The output remains down until the last constituent
release. Consumed keys cannot participate in another overlapping chord until
released and pressed again. Failed prefixes are replayed through non-combo rules
in original order; remaining inputs may start another combo.

Layer activators without `tapKey` are dedicated momentary keys: their layer
activates as soon as the key-down wins rule evaluation, with no hold timer,
and clears on release. An earlier combo can still consume the key or delay
fallback according to the existing combo precedence/window.

Layer activators with `tapKey` accept optional `holdBehavior`:

| Value | Early hold decision |
| --- | --- |
| `balanced` (default) | Another distinct key is pressed and released while the layer key remains held. |
| `hold_preferred` | Another distinct key is pressed while the layer key remains held. |
| `tap_preferred` | No early hold; use the hold deadline. |

All modes fall back to the configured hold deadline (150 ms by default). A
leader release before the first qualifying interruption and before the deadline
emits the tap. A release at the deadline is a hold. Balanced mode therefore
preserves rolls where the layer key releases first. A preexisting key's release
does not count as a completed press after the leader. Repeated downs are ignored.
Omitted `holdBehavior` in existing version-1 profiles defaults to balanced;
unknown values are rejected. The setting has no timing effect on dedicated
layer keys without a tap action.

Home-row modifier keys retain conservative duration-only behavior: other keys
never resolve their hold early. Other input is buffered until a dual-role
decision. For a hold, the modifier/layer applies before replaying subsequent
keys. For a tap, the tap key goes down first and releases at its original
position in the buffered stream. Decisions use the first decisive queued event,
preserving original timestamps and delivery order even when another pending
key delays replay. A later buffered leader release cannot override an earlier
qualifying hold. Events with equal timestamps use their delivery order.

Layer activation has reference counts; releasing one of two activators leaves
the layer active. Key-up releases the action chosen on key-down even if the
layer state subsequently changed.

`fromModifiers` requires each listed modifier but permits additional held
modifiers. Generic command/option/control/shift names match either side;
side-specific names match exactly. Existing physical modifiers remain held.
`toModifiers` adds references; generic output names select the left modifier.
This deliberately does not suppress or replace physical source modifiers.
All output usages (including shared modifiers) are reference-counted so one
source cannot release another's held key. When multiple sources map to the same
usage, the host sees one held key until all sources release.

`fn` is an Apple/vendor usage, not a page-7 keyboard modifier. Profiles using it,
unsupported keys, or consumer/media key names fail validation with an explicit
error. This engine does not implement vendor Fn handling, consumer controls,
sticky/toggle layers, macros, text insertion, cross-device combos, or per-key
timing overrides. It does not assert exact Karabiner behavior equivalence.

## Checks

```sh
cargo test --manifest-path native/engine/Cargo.toml
cargo clippy --manifest-path native/engine/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path native/engine/Cargo.toml -- --check
```

Tests cover all rule types, modifier references, rolling input, combo timeout,
success/failure/release/overlap, deadline boundaries, layer tracking, duplicate
input, validation, reset/profile replacement, and a deterministic 5000-event
mixed stream with balanced output assertions. Layer timing tests demonstrate
navigation output at 1 ms for a dedicated layer, 10 ms for hold-preferred, and
20 ms for balanced, while confirming timer-only fallback and home-row behavior
at 150 ms. They also exercise nested buffering/layers, prior held keys, ordered
combo precedence, and reset. These are engine tests; live
capture, signing, permissions, service installation, and virtual-HID reports are
outside their scope.
