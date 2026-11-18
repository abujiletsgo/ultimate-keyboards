//! Deterministic, device-local USB keyboard remapping. No OS or transport dependency.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

fn default_hold() -> u64 {
    150
}
fn default_combo() -> u64 {
    50
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub version: u32,
    #[serde(default)]
    pub title: String,
    pub rules: Vec<Rule>,
    #[serde(default = "default_hold")]
    pub hold_threshold_ms: u64,
    #[serde(default = "default_combo")]
    pub combo_window_ms: u64,
    /// Typing-streak guard for home-row mods: a home-row key pressed within this
    /// many ms of the previous key press types its letter at once (0 = off).
    #[serde(default)]
    pub typing_streak_ms: u64,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            version: 1,
            title: String::new(),
            rules: vec![],
            hold_threshold_ms: default_hold(),
            combo_window_ms: default_combo(),
            typing_streak_ms: 0,
        }
    }
}

/// Early hold resolution for layer keys that also have a tap action.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HoldBehavior {
    /// Hold when another key completes a press/release before the leader releases.
    #[default]
    Balanced,
    /// Hold as soon as another key is pressed before the leader releases.
    HoldPreferred,
    /// Decide solely from the leader's release time and hold deadline.
    TapPreferred,
    /// Like balanced, but only a key on the other hand of the keyboard can make
    /// it hold early; same-hand keys wait for release or the hold deadline.
    OppositeHand,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Hand {
    Left,
    Right,
}

/// Which hand types a key on a MacBook ANSI/ISO layout; thumbs and modifiers are neither.
fn hand(usage: u16) -> Option<Hand> {
    match usage {
        4..=10 | 20..=23 | 25..=27 | 29 | 30..=34 | 43 | 53 | 57 | 100 => {
            // a b c d e f g, q r s t, v w x, z, 1-5, tab, grave, caps, non-US backslash
            Some(Hand::Left)
        }
        11..=19 | 24 | 28 | 35..=40 | 42 | 45..=52 | 54..=56 => Some(Hand::Right),
        _ => None,
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Rule {
    Simple {
        #[serde(default)]
        description: String,
        from_key: String,
        #[serde(default)]
        from_modifiers: Vec<String>,
        to_key: String,
        #[serde(default)]
        to_modifiers: Vec<String>,
    },
    Combo {
        #[serde(default)]
        description: String,
        from_keys: Vec<String>,
        to_key: String,
        #[serde(default)]
        to_modifiers: Vec<String>,
    },
    LayerActivator {
        #[serde(default)]
        description: String,
        from_key: String,
        layer_name: String,
        #[serde(default)]
        tap_key: Option<String>,
        #[serde(default)]
        hold_behavior: HoldBehavior,
    },
    LayerBinding {
        #[serde(default)]
        description: String,
        layer_name: String,
        from_key: String,
        to_key: String,
        #[serde(default)]
        to_modifiers: Vec<String>,
    },
    HomerowMod {
        #[serde(default)]
        description: String,
        from_key: String,
        tap_key: String,
        mod_key: String,
        /// Per-key hold time; omitted = the profile's holdThresholdMs.
        #[serde(default)]
        hold_threshold_ms: Option<u64>,
        /// Omitted = tap_preferred (the original behaviour).
        #[serde(default)]
        hold_behavior: Option<HoldBehavior>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProfileError(pub String);
impl std::fmt::Display for ProfileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for ProfileError {}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeyEvent {
    pub usage: u16,
    pub down: bool,
    pub at_ms: u64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct OutputEvent {
    pub usage: u16,
    pub down: bool,
}

/// USB HID usage page 7. Fn is vendor-specific and intentionally unsupported.
pub fn key_name_to_usage(name: &str) -> Option<u16> {
    if name.len() == 1 {
        let c = name.as_bytes()[0];
        if c.is_ascii_lowercase() {
            return Some(4 + (c - b'a') as u16);
        }
        if (b'1'..=b'9').contains(&c) {
            return Some(30 + (c - b'1') as u16);
        }
        if c == b'0' {
            return Some(39);
        }
    }
    if let Some(n) = name.strip_prefix('f').and_then(|s| s.parse::<u16>().ok()) {
        if (1..=12).contains(&n) {
            return Some(57 + n);
        }
        if (13..=24).contains(&n) {
            return Some(104 + n - 13);
        }
    }
    Some(match name {
        "return_or_enter" => 40,
        "escape" => 41,
        "delete_or_backspace" => 42,
        "tab" => 43,
        "spacebar" => 44,
        "hyphen" => 45,
        "equal_sign" => 46,
        "open_bracket" => 47,
        "close_bracket" => 48,
        "backslash" => 49,
        "non_us_pound" => 50,
        "semicolon" => 51,
        "quote" => 52,
        "grave_accent_and_tilde" => 53,
        "comma" => 54,
        "period" => 55,
        "slash" => 56,
        "caps_lock" => 57,
        "print_screen" => 70,
        "scroll_lock" => 71,
        "pause" => 72,
        "insert" => 73,
        "home" => 74,
        "page_up" => 75,
        "delete_forward" => 76,
        "end" => 77,
        "page_down" => 78,
        "right_arrow" => 79,
        "left_arrow" => 80,
        "down_arrow" => 81,
        "up_arrow" => 82,
        "keypad_num_lock" => 83,
        "keypad_slash" => 84,
        "keypad_asterisk" => 85,
        "keypad_hyphen" => 86,
        "keypad_plus" => 87,
        "keypad_enter" => 88,
        "keypad_1" => 89,
        "keypad_2" => 90,
        "keypad_3" => 91,
        "keypad_4" => 92,
        "keypad_5" => 93,
        "keypad_6" => 94,
        "keypad_7" => 95,
        "keypad_8" => 96,
        "keypad_9" => 97,
        "keypad_0" => 98,
        "keypad_period" => 99,
        "non_us_backslash" => 100,
        "application" => 101,
        "left_control" => 224,
        "left_shift" => 225,
        "left_option" | "left_alt" => 226,
        "left_command" | "left_gui" => 227,
        "right_control" => 228,
        "right_shift" => 229,
        "right_option" | "right_alt" => 230,
        "right_command" | "right_gui" => 231,
        _ => return None,
    })
}

/// Left Control, Shift, Option, Command.
const HYPER: [u16; 4] = [224, 225, 226, 227];

fn key(s: &str) -> Result<u16, ProfileError> {
    key_name_to_usage(s).ok_or_else(|| {
        ProfileError(format!(
            "Unsupported keyboard key '{s}' (Fn and consumer/vendor usages are not supported)"
        ))
    })
}
fn modifier(s: &str) -> Result<Vec<u16>, ProfileError> {
    let pair = match s {
        "control" => Some(224),
        "shift" => Some(225),
        "option" | "alt" => Some(226),
        "command" | "gui" => Some(227),
        _ => None,
    };
    if let Some(left) = pair {
        return Ok(vec![left, left + 4]);
    }
    let k = key(s)?;
    if (224..=231).contains(&k) {
        Ok(vec![k])
    } else {
        Err(ProfileError(format!("'{s}' is not a modifier")))
    }
}
fn output(k: &str, mods: &[String]) -> Result<Vec<u16>, ProfileError> {
    let mut out = Vec::new();
    for m in mods {
        let k = modifier(m)?[0];
        if !out.contains(&k) {
            out.push(k);
        }
    }
    let k = key(k)?;
    if !out.contains(&k) {
        out.push(k);
    }
    Ok(out)
}
fn layer(s: &str) -> Result<String, ProfileError> {
    if s.trim().is_empty() || s.len() > 64 {
        Err(ProfileError("Layer name must contain 1..64 bytes".into()))
    } else {
        Ok(s.into())
    }
}

#[derive(Clone, Debug)]
enum Hold {
    /// One modifier key, or all four for Hyper.
    Modifiers(Vec<u16>),
    Layer(String),
}
#[derive(Clone, Debug)]
enum Compiled {
    Simple {
        from: u16,
        modifiers: Vec<Vec<u16>>,
        out: Vec<u16>,
    },
    Combo {
        from: BTreeSet<u16>,
        out: Vec<u16>,
    },
    Dual {
        from: u16,
        tap: Option<u16>,
        hold: Hold,
        behavior: HoldBehavior,
        hold_ms: u64,
        streak_guard: bool,
    },
    Binding {
        from: u16,
        layer: String,
        out: Vec<u16>,
    },
}
#[derive(Debug)]
enum Active {
    Output(Vec<u16>),
    Hold(Hold),
    Combo(u64),
}
#[derive(Debug)]
enum Pending {
    Dual {
        key: u16,
        tap: Option<u16>,
        hold: Hold,
        deadline: u64,
        behavior: HoldBehavior,
    },
    Combo {
        candidates: Vec<usize>,
        deadline: u64,
    },
}

/// One engine per physical keyboard. Feed monotonic milliseconds; timestamps that
/// move backwards are clamped. Duplicate downs/releases are ignored.
pub struct Engine {
    rules: Vec<Compiled>,
    combo_ms: u64,
    streak_ms: u64,
    last_down_at: Option<u64>,
    now: u64,
    physical: BTreeSet<u16>,
    queue: VecDeque<KeyEvent>,
    pending: Option<Pending>,
    active: BTreeMap<u16, Active>,
    layers: BTreeMap<String, usize>,
    layer_stack: Vec<String>,
    refs: BTreeMap<u16, usize>,
    combos: BTreeMap<u64, (usize, Vec<u16>)>,
    combo_id: u64,
}

impl Engine {
    pub fn new(profile: Profile) -> Result<Self, ProfileError> {
        if profile.version != 1 {
            return Err(ProfileError("Only profile version 1 is supported".into()));
        }
        if !(50..=1000).contains(&profile.hold_threshold_ms) {
            return Err(ProfileError("holdThresholdMs must be 50..1000".into()));
        }
        if !(10..=200).contains(&profile.combo_window_ms) {
            return Err(ProfileError("comboWindowMs must be 10..200".into()));
        }
        if profile.typing_streak_ms > 500 {
            return Err(ProfileError("typingStreakMs must be 0..500".into()));
        }
        if profile.rules.len() > 1024 {
            return Err(ProfileError("At most 1024 rules are supported".into()));
        }
        let mut rules = Vec::new();
        for r in profile.rules {
            rules.push(match r {
                Rule::Simple {
                    from_key,
                    from_modifiers,
                    to_key,
                    to_modifiers,
                    ..
                } => Compiled::Simple {
                    from: key(&from_key)?,
                    modifiers: from_modifiers
                        .iter()
                        .map(|s| modifier(s))
                        .collect::<Result<_, _>>()?,
                    out: output(&to_key, &to_modifiers)?,
                },
                Rule::Combo {
                    from_keys,
                    to_key,
                    to_modifiers,
                    ..
                } => {
                    let from: BTreeSet<_> =
                        from_keys.iter().map(|s| key(s)).collect::<Result<_, _>>()?;
                    if !(2..=8).contains(&from.len()) || from.len() != from_keys.len() {
                        return Err(ProfileError("Combo requires 2..8 distinct keys".into()));
                    }
                    Compiled::Combo {
                        from,
                        out: output(&to_key, &to_modifiers)?,
                    }
                }
                Rule::LayerActivator {
                    from_key,
                    layer_name,
                    tap_key,
                    hold_behavior,
                    ..
                } => Compiled::Dual {
                    from: key(&from_key)?,
                    tap: tap_key.as_deref().map(key).transpose()?,
                    hold: Hold::Layer(layer(&layer_name)?),
                    behavior: hold_behavior,
                    hold_ms: profile.hold_threshold_ms,
                    streak_guard: false,
                },
                Rule::HomerowMod {
                    from_key,
                    tap_key,
                    mod_key,
                    hold_threshold_ms,
                    hold_behavior,
                    ..
                } => {
                    let hold_ms = hold_threshold_ms.unwrap_or(profile.hold_threshold_ms);
                    if !(50..=1000).contains(&hold_ms) {
                        return Err(ProfileError("holdThresholdMs must be 50..1000".into()));
                    }
                    // "hyper" = Control+Option+Shift+Command held together, for Caps Lock.
                    let hyper = mod_key == "hyper";
                    let mods = if hyper {
                        HYPER.to_vec()
                    } else {
                        let m = key(&mod_key)?;
                        if !(224..=231).contains(&m) {
                            return Err(ProfileError(
                                "modKey must be a left/right modifier key or hyper".into(),
                            ));
                        }
                        vec![m]
                    };
                    Compiled::Dual {
                        from: key(&from_key)?,
                        tap: Some(key(&tap_key)?),
                        hold: Hold::Modifiers(mods),
                        // Hyper is for shortcuts: any other key pressed while held makes it hold.
                        behavior: hold_behavior.unwrap_or(if hyper {
                            HoldBehavior::HoldPreferred
                        } else {
                            HoldBehavior::TapPreferred
                        }),
                        hold_ms,
                        // Caps Lock is not a letter: a streak of typing must not turn it into a tap.
                        streak_guard: !hyper,
                    }
                }
                Rule::LayerBinding {
                    from_key,
                    layer_name,
                    to_key,
                    to_modifiers,
                    ..
                } => Compiled::Binding {
                    from: key(&from_key)?,
                    layer: layer(&layer_name)?,
                    out: output(&to_key, &to_modifiers)?,
                },
            });
        }
        Ok(Self {
            rules,
            combo_ms: profile.combo_window_ms,
            streak_ms: profile.typing_streak_ms,
            last_down_at: None,
            now: 0,
            physical: BTreeSet::new(),
            queue: VecDeque::new(),
            pending: None,
            active: BTreeMap::new(),
            layers: BTreeMap::new(),
            layer_stack: Vec::new(),
            refs: BTreeMap::new(),
            combos: BTreeMap::new(),
            combo_id: 0,
        })
    }

    pub fn process(&mut self, mut event: KeyEvent) -> Vec<OutputEvent> {
        event.at_ms = event.at_ms.max(self.now);
        self.now = event.at_ms;
        let valid = (4..=231).contains(&event.usage)
            && if event.down {
                self.physical.insert(event.usage)
            } else {
                self.physical.remove(&event.usage)
            };
        if valid {
            self.queue.push_back(event);
        }
        let mut out = vec![];
        self.drain(&mut out);
        out
    }

    pub fn tick(&mut self, now_ms: u64) -> Vec<OutputEvent> {
        self.now = self.now.max(now_ms);
        let mut out = vec![];
        self.drain(&mut out);
        out
    }

    pub fn next_deadline_ms(&self) -> Option<u64> {
        self.pending.as_ref().map(|p| match p {
            Pending::Dual { deadline, .. } | Pending::Combo { deadline, .. } => *deadline,
        })
    }

    /// Currently active layers in the order they were entered (empty when on Base).
    pub fn active_layers(&self) -> &[String] {
        &self.layer_stack
    }

    /// Release every currently emitted usage and discard buffered input. Call
    /// before device removal, profile replacement, or shutdown; deliver outputs.
    pub fn reset(&mut self) -> Vec<OutputEvent> {
        let mut usages: Vec<_> = self.refs.keys().copied().collect();
        usages.sort_by_key(|u| ((224..=231).contains(u), *u));
        let out = usages
            .into_iter()
            .map(|usage| OutputEvent { usage, down: false })
            .collect();
        self.physical.clear();
        self.queue.clear();
        self.pending = None;
        self.last_down_at = None;
        self.active.clear();
        self.layers.clear();
        self.layer_stack.clear();
        self.refs.clear();
        self.combos.clear();
        out
    }

    fn press(&mut self, usages: &[u16], out: &mut Vec<OutputEvent>) {
        for &usage in usages {
            let n = self.refs.entry(usage).or_default();
            if *n == 0 {
                out.push(OutputEvent { usage, down: true });
            }
            *n += 1;
        }
    }
    fn release(&mut self, usages: &[u16], out: &mut Vec<OutputEvent>) {
        for &usage in usages.iter().rev() {
            if let Some(n) = self.refs.get_mut(&usage) {
                *n -= 1;
                if *n == 0 {
                    self.refs.remove(&usage);
                    out.push(OutputEvent { usage, down: false });
                }
            }
        }
    }
    fn start_hold(&mut self, key: u16, hold: Hold, out: &mut Vec<OutputEvent>) {
        match &hold {
            Hold::Modifiers(m) => self.press(m, out),
            Hold::Layer(l) => {
                let n = self.layers.entry(l.clone()).or_default();
                if *n == 0 {
                    self.layer_stack.push(l.clone());
                }
                *n += 1;
            }
        }
        self.active.insert(key, Active::Hold(hold));
    }
    fn up(&mut self, usage: u16, out: &mut Vec<OutputEvent>) {
        match self.active.remove(&usage) {
            Some(Active::Output(usages)) => self.release(&usages, out),
            Some(Active::Hold(Hold::Modifiers(m))) => self.release(&m, out),
            Some(Active::Hold(Hold::Layer(l))) => {
                if let Some(n) = self.layers.get_mut(&l) {
                    *n -= 1;
                    if *n == 0 {
                        self.layers.remove(&l);
                        self.layer_stack.retain(|active| active != &l);
                    }
                }
            }
            Some(Active::Combo(id)) => {
                if let Some((n, _)) = self.combos.get_mut(&id) {
                    *n -= 1;
                    if *n == 0 {
                        let (_, usages) = self.combos.remove(&id).unwrap();
                        self.release(&usages, out);
                    }
                }
            }
            None => {}
        }
    }
    fn matches(&self, r: &Compiled, k: u16, allow_combo: bool) -> bool {
        match r {
            Compiled::Simple {
                from, modifiers, ..
            } => {
                *from == k
                    && modifiers
                        .iter()
                        .all(|group| group.iter().any(|m| self.refs.contains_key(m)))
            }
            Compiled::Dual { from, .. } => *from == k,
            Compiled::Binding { from, layer, .. } => *from == k && self.layers.contains_key(layer),
            Compiled::Combo { from, .. } => allow_combo && from.contains(&k),
        }
    }
    fn down(&mut self, event: KeyEvent, allow_combo: bool, out: &mut Vec<OutputEvent>) {
        // A combo candidate is re-queued and comes back through here, so only
        // record the streak once the press is actually resolved below.
        let previous_down = self.last_down_at;
        if !(224..=231).contains(&event.usage) {
            self.last_down_at = Some(event.at_ms);
        }
        let mut selected = self
            .rules
            .iter()
            .position(|r| self.matches(r, event.usage, allow_combo));
        // A combo gets the first chance at a home-row key even when the
        // home-row rule is listed first (the app writes home-row keys before
        // combos). If the combo doesn't complete, the key is re-queued with
        // allow_combo = false and falls back to its home-row role.
        if allow_combo && matches!(selected.map(|i| &self.rules[i]), Some(Compiled::Dual { .. })) {
            if let Some(c) = self.rules.iter().position(
                |r| matches!(r, Compiled::Combo { from, .. } if from.contains(&event.usage)),
            ) {
                selected = Some(c);
            }
        }
        match selected.map(|i| (i, self.rules[i].clone())) {
            Some((
                _,
                Compiled::Simple { out: usages, .. } | Compiled::Binding { out: usages, .. },
            )) => {
                self.press(&usages, out);
                self.active.insert(event.usage, Active::Output(usages));
            }
            Some((
                _,
                Compiled::Dual {
                    tap,
                    hold,
                    behavior,
                    hold_ms,
                    streak_guard,
                    ..
                },
            )) => {
                let in_streak = streak_guard
                    && self.streak_ms > 0
                    && previous_down.is_some_and(|t| event.at_ms.saturating_sub(t) < self.streak_ms);
                if tap.is_none() {
                    // A dedicated layer key has no tap decision to wait for.
                    self.start_hold(event.usage, hold, out);
                } else if in_streak {
                    // Mid-word: a home-row key typed right after another key is a letter.
                    let usages: Vec<_> = tap.into_iter().collect();
                    self.press(&usages, out);
                    self.active.insert(event.usage, Active::Output(usages));
                } else {
                    self.pending = Some(Pending::Dual {
                        key: event.usage,
                        tap,
                        hold,
                        deadline: event.at_ms.saturating_add(hold_ms),
                        behavior,
                    });
                }
            }
            Some((i, Compiled::Combo { .. })) => {
                // Not resolved yet: the press comes back through down() later.
                self.last_down_at = previous_down;
                let candidates = (i..self.rules.len()).filter(|&n| matches!(&self.rules[n], Compiled::Combo {from, ..} if from.contains(&event.usage))).collect();
                self.queue.push_front(event);
                self.pending = Some(Pending::Combo {
                    candidates,
                    deadline: event.at_ms.saturating_add(self.combo_ms),
                });
            }
            None => {
                self.press(&[event.usage], out);
                self.active
                    .insert(event.usage, Active::Output(vec![event.usage]));
            }
        }
    }
    fn drain(&mut self, out: &mut Vec<OutputEvent>) {
        loop {
            if let Some(pending) = self.pending.take() {
                match pending {
                    Pending::Dual {
                        key,
                        tap,
                        hold,
                        deadline,
                        behavior,
                    } => {
                        // Replay may expose several buffered events at once. Resolve
                        // the FIRST decisive event in their original order, rather
                        // than consulting today's physical set or searching for any
                        // later leader release. The latter loses nested layer holds.
                        let mut hold_decision = None;
                        let mut other_downs = BTreeSet::new();
                        for event in &self.queue {
                            if event.at_ms >= deadline {
                                hold_decision = Some(true);
                                break;
                            }
                            if event.usage == key {
                                if !event.down {
                                    hold_decision = Some(false);
                                    break;
                                }
                            } else if event.down {
                                if behavior == HoldBehavior::HoldPreferred {
                                    hold_decision = Some(true);
                                    break;
                                }
                                let same_hand = hand(event.usage).is_some()
                                    && hand(event.usage) == hand(key);
                                if !(behavior == HoldBehavior::OppositeHand && same_hand) {
                                    other_downs.insert(event.usage);
                                }
                            } else if matches!(
                                behavior,
                                HoldBehavior::Balanced | HoldBehavior::OppositeHand
                            ) && other_downs.remove(&event.usage)
                            {
                                hold_decision = Some(true);
                                break;
                            }
                        }
                        if hold_decision == Some(false) {
                            let usages: Vec<_> = tap.into_iter().collect();
                            self.press(&usages, out);
                            self.active.insert(key, Active::Output(usages));
                        } else if hold_decision == Some(true) || self.now >= deadline {
                            self.start_hold(key, hold, out);
                        } else {
                            self.pending = Some(Pending::Dual {
                                key,
                                tap,
                                hold,
                                deadline,
                                behavior,
                            });
                            return;
                        }
                    }
                    Pending::Combo {
                        candidates,
                        deadline,
                    } => {
                        let mut seen = BTreeSet::new();
                        let mut possible = candidates.clone();
                        let mut matched = None;
                        let mut failed = false;
                        for event in &self.queue {
                            if !event.down || event.at_ms >= deadline {
                                failed = true;
                                break;
                            }
                            seen.insert(event.usage);
                            possible.retain(|&i| matches!(&self.rules[i], Compiled::Combo {from, ..} if seen.is_subset(from)));
                            if possible.is_empty() {
                                failed = true;
                                break;
                            }
                            if let Some(&i) = possible.iter().find(|&&i| matches!(&self.rules[i], Compiled::Combo {from, ..} if *from == seen)) { matched = Some(i); break; }
                        }
                        if let Some(i) = matched {
                            let Compiled::Combo { from, out: usages } = self.rules[i].clone()
                            else {
                                unreachable!()
                            };
                            self.combo_id = self.combo_id.wrapping_add(1);
                            let id = self.combo_id;
                            for _ in 0..from.len() {
                                let e = self.queue.pop_front().unwrap();
                                self.active.insert(e.usage, Active::Combo(id));
                            }
                            self.press(&usages, out);
                            self.combos.insert(id, (from.len(), usages));
                        } else if failed || self.now >= deadline {
                            let first = self.queue.pop_front().unwrap();
                            self.down(first, false, out);
                        } else {
                            self.pending = Some(Pending::Combo {
                                candidates,
                                deadline,
                            });
                            return;
                        }
                    }
                }
                continue;
            }
            let Some(event) = self.queue.pop_front() else {
                return;
            };
            if event.down {
                self.down(event, true, out);
            } else {
                self.up(event.usage, out);
            }
        }
    }
}
