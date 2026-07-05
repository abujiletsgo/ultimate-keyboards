// MacBook Pro (US ANSI) keyboard layout
// Each key: key_code (Karabiner), label, x/y in key-units, w/h in key-units
// 1u = KEY_UNIT px, gap = KEY_GAP px

export interface MacKey {
  code: string       // Karabiner key_code
  label: string      // display label
  x: number          // position in key units
  y: number
  w?: number         // width in key units (default 1)
  h?: number         // height in key units (default 1)
  small?: boolean    // fn-row sizing
  icon?: string      // optional symbol override
}

// Row spacing: fn row is shorter (0.75u tall), then 0.25u gap, then normal rows
const FN_H = 0.65
const FN_Y = 0
const R1_Y = FN_H + 0.35   // ~1.0
const R2_Y = R1_Y + 1.05
const R3_Y = R2_Y + 1.05
const R4_Y = R3_Y + 1.05
const R5_Y = R4_Y + 1.05

export const MACBOOK_LAYOUT: MacKey[] = [
  // ── Fn / Media row ──────────────────────────────────────────────
  { code: 'escape',              label: 'esc',   x: 0,      y: FN_Y, w: 1.25, h: FN_H, small: true },
  { code: 'f1',                  label: 'F1',    x: 1.75,   y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'f2',                  label: 'F2',    x: 2.85,   y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'f3',                  label: 'F3',    x: 3.95,   y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'f4',                  label: 'F4',    x: 5.05,   y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'f5',                  label: 'F5',    x: 6.4,    y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'f6',                  label: 'F6',    x: 7.5,    y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'f7',                  label: 'F7',    x: 8.6,    y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'f8',                  label: 'F8',    x: 9.7,    y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'f9',                  label: 'F9',    x: 11.05,  y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'f10',                 label: 'F10',   x: 12.15,  y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'f11',                 label: 'F11',   x: 13.25,  y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'f12',                 label: 'F12',   x: 14.35,  y: FN_Y, w: 1,    h: FN_H, small: true },
  { code: 'power',               label: '⏻',    x: 15.65,  y: FN_Y, w: 1.35, h: FN_H, small: true },

  // ── Row 1 — Numbers ─────────────────────────────────────────────
  { code: 'grave_accent_and_tilde', label: '`',  x: 0,      y: R1_Y },
  { code: '1',                   label: '1',     x: 1.1,    y: R1_Y },
  { code: '2',                   label: '2',     x: 2.2,    y: R1_Y },
  { code: '3',                   label: '3',     x: 3.3,    y: R1_Y },
  { code: '4',                   label: '4',     x: 4.4,    y: R1_Y },
  { code: '5',                   label: '5',     x: 5.5,    y: R1_Y },
  { code: '6',                   label: '6',     x: 6.6,    y: R1_Y },
  { code: '7',                   label: '7',     x: 7.7,    y: R1_Y },
  { code: '8',                   label: '8',     x: 8.8,    y: R1_Y },
  { code: '9',                   label: '9',     x: 9.9,    y: R1_Y },
  { code: '0',                   label: '0',     x: 11.0,   y: R1_Y },
  { code: 'hyphen',              label: '-',     x: 12.1,   y: R1_Y },
  { code: 'equal_sign',          label: '=',     x: 13.2,   y: R1_Y },
  { code: 'delete_or_backspace', label: '⌫',    x: 14.3,   y: R1_Y, w: 2.7 },

  // ── Row 2 — QWERTY ──────────────────────────────────────────────
  { code: 'tab',                 label: '⇥',    x: 0,      y: R2_Y, w: 1.6 },
  { code: 'q',                   label: 'Q',     x: 1.7,    y: R2_Y },
  { code: 'w',                   label: 'W',     x: 2.8,    y: R2_Y },
  { code: 'e',                   label: 'E',     x: 3.9,    y: R2_Y },
  { code: 'r',                   label: 'R',     x: 5.0,    y: R2_Y },
  { code: 't',                   label: 'T',     x: 6.1,    y: R2_Y },
  { code: 'y',                   label: 'Y',     x: 7.2,    y: R2_Y },
  { code: 'u',                   label: 'U',     x: 8.3,    y: R2_Y },
  { code: 'i',                   label: 'I',     x: 9.4,    y: R2_Y },
  { code: 'o',                   label: 'O',     x: 10.5,   y: R2_Y },
  { code: 'p',                   label: 'P',     x: 11.6,   y: R2_Y },
  { code: 'open_bracket',        label: '[',     x: 12.7,   y: R2_Y },
  { code: 'close_bracket',       label: ']',     x: 13.8,   y: R2_Y },
  { code: 'backslash',           label: '\\',   x: 14.9,   y: R2_Y, w: 2.1 },

  // ── Row 3 — Home Row ────────────────────────────────────────────
  { code: 'caps_lock',           label: 'caps',  x: 0,      y: R3_Y, w: 1.85 },
  { code: 'a',                   label: 'A',     x: 1.95,   y: R3_Y },
  { code: 's',                   label: 'S',     x: 3.05,   y: R3_Y },
  { code: 'd',                   label: 'D',     x: 4.15,   y: R3_Y },
  { code: 'f',                   label: 'F',     x: 5.25,   y: R3_Y },
  { code: 'g',                   label: 'G',     x: 6.35,   y: R3_Y },
  { code: 'h',                   label: 'H',     x: 7.45,   y: R3_Y },
  { code: 'j',                   label: 'J',     x: 8.55,   y: R3_Y },
  { code: 'k',                   label: 'K',     x: 9.65,   y: R3_Y },
  { code: 'l',                   label: 'L',     x: 10.75,  y: R3_Y },
  { code: 'semicolon',           label: ';',     x: 11.85,  y: R3_Y },
  { code: 'quote',               label: "'",     x: 12.95,  y: R3_Y },
  { code: 'return_or_enter',     label: '↵',    x: 14.05,  y: R3_Y, w: 2.95 },

  // ── Row 4 — Bottom Alpha ────────────────────────────────────────
  { code: 'left_shift',          label: '⇧',    x: 0,      y: R4_Y, w: 2.35 },
  { code: 'z',                   label: 'Z',     x: 2.45,   y: R4_Y },
  { code: 'x',                   label: 'X',     x: 3.55,   y: R4_Y },
  { code: 'c',                   label: 'C',     x: 4.65,   y: R4_Y },
  { code: 'v',                   label: 'V',     x: 5.75,   y: R4_Y },
  { code: 'b',                   label: 'B',     x: 6.85,   y: R4_Y },
  { code: 'n',                   label: 'N',     x: 7.95,   y: R4_Y },
  { code: 'm',                   label: 'M',     x: 9.05,   y: R4_Y },
  { code: 'comma',               label: ',',     x: 10.15,  y: R4_Y },
  { code: 'period',              label: '.',     x: 11.25,  y: R4_Y },
  { code: 'slash',               label: '/',     x: 12.35,  y: R4_Y },
  { code: 'right_shift',         label: '⇧',    x: 13.45,  y: R4_Y, w: 3.55 },

  // ── Row 5 — Modifiers + Space ───────────────────────────────────
  { code: 'fn',                  label: 'fn',    x: 0,      y: R5_Y, w: 1.15 },
  { code: 'left_control',        label: '⌃',    x: 1.25,   y: R5_Y, w: 1.15 },
  { code: 'left_option',         label: '⌥',    x: 2.5,    y: R5_Y, w: 1.15 },
  { code: 'left_command',        label: '⌘',    x: 3.75,   y: R5_Y, w: 1.6 },
  { code: 'spacebar',            label: '',      x: 5.45,   y: R5_Y, w: 5.35 },
  { code: 'right_command',       label: '⌘',    x: 10.9,   y: R5_Y, w: 1.6 },
  { code: 'right_option',        label: '⌥',    x: 12.6,   y: R5_Y, w: 1.15 },

  // Arrow keys (right cluster, half-height stacked)
  { code: 'left_arrow',          label: '←',    x: 13.85,  y: R5_Y + 0.525, w: 1.05, h: 0.5 },
  { code: 'up_arrow',            label: '↑',    x: 14.9,   y: R5_Y,         w: 1.05, h: 0.5 },
  { code: 'down_arrow',          label: '↓',    x: 14.9,   y: R5_Y + 0.525, w: 1.05, h: 0.5 },
  { code: 'right_arrow',         label: '→',    x: 15.95,  y: R5_Y + 0.525, w: 1.05, h: 0.5 },
]

export const KEY_UNIT = 46   // px per 1u
export const KEY_GAP = 4     // px gap between keys
export const KEY_RADIUS = 6  // px border radius

export function getKeyStyle(key: MacKey): React.CSSProperties {
  const u = key.w ?? 1
  const h = key.h ?? 1
  return {
    position: 'absolute' as const,
    left:   key.x * (KEY_UNIT + KEY_GAP),
    top:    key.y * (KEY_UNIT + KEY_GAP),
    width:  u * KEY_UNIT + (u - 1) * KEY_GAP,
    height: h * KEY_UNIT + (h - 1) * KEY_GAP,
    borderRadius: KEY_RADIUS,
  }
}

// Total board width/height for the container
export const BOARD_WIDTH  = 17.0 * (KEY_UNIT + KEY_GAP)
export const BOARD_HEIGHT = (R5_Y + 1) * (KEY_UNIT + KEY_GAP)
