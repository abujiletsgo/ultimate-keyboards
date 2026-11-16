//! USB HID page-7 usages (what the engine speaks) <-> Windows set-1 scan codes.
//! Windows reports a key by scan code plus an "extended" (E0) bit; output uses
//! the same pair through `KEYEVENTF_SCANCODE`, so the active layout stays in charge
//! of what a key types.

/// How `SendInput` must name a key.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyCode {
    Scan { code: u16, extended: bool },
    /// Pause has no ordinary scan code (it is E1 1D 45).
    Vk(u16),
}

pub const VK_PAUSE: u16 = 0x13;
pub const VK_NUMLOCK: u16 = 0x90;
const USAGE_PAUSE: u16 = 72;
const USAGE_NUM_LOCK: u16 = 83;

const fn k(usage: u16, code: u16, extended: bool) -> (u16, u16, bool) {
    (usage, code, extended)
}

/// (usage, scan code, extended). Order matters only for `non_us_pound`, which shares a
/// physical code with backslash and so is output-only.
const TABLE: &[(u16, u16, bool)] = &[
    // a..z
    k(4, 0x1E, false), k(5, 0x30, false), k(6, 0x2E, false), k(7, 0x20, false),
    k(8, 0x12, false), k(9, 0x21, false), k(10, 0x22, false), k(11, 0x23, false),
    k(12, 0x17, false), k(13, 0x24, false), k(14, 0x25, false), k(15, 0x26, false),
    k(16, 0x32, false), k(17, 0x31, false), k(18, 0x18, false), k(19, 0x19, false),
    k(20, 0x10, false), k(21, 0x13, false), k(22, 0x1F, false), k(23, 0x14, false),
    k(24, 0x16, false), k(25, 0x2F, false), k(26, 0x11, false), k(27, 0x2D, false),
    k(28, 0x15, false), k(29, 0x2C, false),
    // 1..9, 0
    k(30, 0x02, false), k(31, 0x03, false), k(32, 0x04, false), k(33, 0x05, false),
    k(34, 0x06, false), k(35, 0x07, false), k(36, 0x08, false), k(37, 0x09, false),
    k(38, 0x0A, false), k(39, 0x0B, false),
    // enter esc backspace tab space - = [ ] \ (pound) ; ' ` , . / caps
    k(40, 0x1C, false), k(41, 0x01, false), k(42, 0x0E, false), k(43, 0x0F, false),
    k(44, 0x39, false), k(45, 0x0C, false), k(46, 0x0D, false), k(47, 0x1A, false),
    k(48, 0x1B, false), k(49, 0x2B, false), k(50, 0x2B, false), k(51, 0x27, false),
    k(52, 0x28, false), k(53, 0x29, false), k(54, 0x33, false), k(55, 0x34, false),
    k(56, 0x35, false), k(57, 0x3A, false),
    // F1..F10, F11, F12
    k(58, 0x3B, false), k(59, 0x3C, false), k(60, 0x3D, false), k(61, 0x3E, false),
    k(62, 0x3F, false), k(63, 0x40, false), k(64, 0x41, false), k(65, 0x42, false),
    k(66, 0x43, false), k(67, 0x44, false), k(68, 0x57, false), k(69, 0x58, false),
    // print screen, scroll lock, (pause by VK), insert home pgup delete end pgdn, arrows
    k(70, 0x37, true), k(71, 0x46, false),
    k(73, 0x52, true), k(74, 0x47, true), k(75, 0x49, true), k(76, 0x53, true),
    k(77, 0x4F, true), k(78, 0x51, true), k(79, 0x4D, true), k(80, 0x4B, true),
    k(81, 0x50, true), k(82, 0x48, true),
    // keypad: num lock / * - + enter 1..9 0 .
    k(83, 0x45, true), k(84, 0x35, true), k(85, 0x37, false), k(86, 0x4A, false),
    k(87, 0x4E, false), k(88, 0x1C, true), k(89, 0x4F, false), k(90, 0x50, false),
    k(91, 0x51, false), k(92, 0x4B, false), k(93, 0x4C, false), k(94, 0x4D, false),
    k(95, 0x47, false), k(96, 0x48, false), k(97, 0x49, false), k(98, 0x52, false),
    k(99, 0x53, false),
    // ISO backslash, menu
    k(100, 0x56, false), k(101, 0x5D, true),
    // F13..F24
    k(104, 0x64, false), k(105, 0x65, false), k(106, 0x66, false), k(107, 0x67, false),
    k(108, 0x68, false), k(109, 0x69, false), k(110, 0x6A, false), k(111, 0x6B, false),
    k(112, 0x6C, false), k(113, 0x6D, false), k(114, 0x6E, false), k(115, 0x76, false),
    // LCtrl LShift LAlt LWin RCtrl RShift RAlt RWin
    k(224, 0x1D, false), k(225, 0x2A, false), k(226, 0x38, false), k(227, 0x5B, true),
    k(228, 0x1D, true), k(229, 0x36, false), k(230, 0x38, true), k(231, 0x5C, true),
];

/// The usage for a physical event: `vk`, scan code and the extended bit of a
/// `KBDLLHOOKSTRUCT`. `None` means "not a key the engine models" (media keys, IME keys,
/// fake shifts, ...): the caller must let it through untouched.
pub fn usage_from_event(vk: u16, scan: u16, extended: bool) -> Option<u16> {
    match vk {
        VK_PAUSE => return Some(USAGE_PAUSE),
        VK_NUMLOCK => return Some(USAGE_NUM_LOCK),
        _ => {}
    }
    if scan == 0x54 && !extended {
        return Some(70); // Alt+PrintScreen reports 0x54
    }
    TABLE
        .iter()
        .find(|&&(usage, c, e)| c == scan && e == extended && usage != 50)
        .map(|&(usage, ..)| usage)
}

pub fn key_code(usage: u16) -> Option<KeyCode> {
    if usage == USAGE_PAUSE {
        return Some(KeyCode::Vk(VK_PAUSE));
    }
    TABLE
        .iter()
        .find(|&&(u, ..)| u == usage)
        .map(|&(_, code, extended)| KeyCode::Scan { code, extended })
}

pub fn is_modifier(usage: u16) -> bool {
    (224..=231).contains(&usage)
}

/// Every usage this crate can emit, for the emergency all-up release.
pub fn all_usages() -> impl Iterator<Item = u16> {
    TABLE.iter().map(|&(u, ..)| u).chain([USAGE_PAUSE])
}

#[cfg(test)]
mod tests {
    use super::*;
    use ultimate_keyboards_engine::key_name_to_usage;

    #[test]
    fn every_usage_the_engine_can_name_has_an_output_code() {
        for u in (4..=101).chain(104..=115).chain(224..=231) {
            assert!(key_code(u).is_some(), "usage {u}");
        }
        let names = ["a", "z", "0", "9", "f1", "f12", "f13", "f24", "spacebar", "pause",
            "left_option", "right_gui", "keypad_enter", "non_us_pound", "application"];
        for n in names {
            let u = key_name_to_usage(n).unwrap();
            assert!(key_code(u).is_some(), "{n}");
        }
    }

    #[test]
    fn scan_codes_round_trip_except_the_shared_pound_key() {
        for &(usage, code, extended) in TABLE {
            if usage == 50 {
                assert_eq!(usage_from_event(0, code, extended), Some(49));
                continue;
            }
            assert_eq!(usage_from_event(0, code, extended), Some(usage), "usage {usage}");
            assert_eq!(key_code(usage), Some(KeyCode::Scan { code, extended }));
        }
    }

    #[test]
    fn table_has_no_duplicate_physical_keys() {
        let mut seen = std::collections::BTreeSet::new();
        for &(usage, code, extended) in TABLE {
            assert!(usage == 50 || seen.insert((code, extended)), "usage {usage}");
        }
    }

    #[test]
    fn left_and_right_modifiers_and_extended_keys_are_distinct() {
        assert_eq!(usage_from_event(0xA2, 0x1D, false), Some(224));
        assert_eq!(usage_from_event(0xA3, 0x1D, true), Some(228));
        assert_eq!(usage_from_event(0xA4, 0x38, false), Some(226));
        assert_eq!(usage_from_event(0xA5, 0x38, true), Some(230));
        assert_eq!(usage_from_event(0, 0x47, true), Some(74)); // Home
        assert_eq!(usage_from_event(0, 0x47, false), Some(95)); // keypad 7
        assert_eq!(usage_from_event(VK_PAUSE, 0x45, false), Some(72));
        assert_eq!(usage_from_event(VK_NUMLOCK, 0x45, true), Some(83));
        assert_eq!(key_code(72), Some(KeyCode::Vk(VK_PAUSE)));
    }

    #[test]
    fn unmodeled_keys_pass_through() {
        assert_eq!(usage_from_event(0xAF, 0x30, true), None); // volume up (E0 30)
        assert_eq!(usage_from_event(0x15, 0xF2, false), None); // Hangul key
        assert_eq!(usage_from_event(0xFF, 0, false), None);
        assert_eq!(usage_from_event(0x10, 0x2A, true), None); // fake shift of the numpad
        assert_eq!(usage_from_event(0, 0x21D, false), None); // AltGr's fake Ctrl
    }
}
