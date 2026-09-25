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

// Geometry of a current MacBook (US ANSI): every row is 14.5u wide, the
// function row is ~0.6u tall with no gaps, and the arrows are an inverted T
// with half-height up/down between full-height left/right.
const FN_H = 0.6
const GAP_Y = 0.15
const ROW = (n: number) => FN_H + GAP_Y + n   // n = 0..4 for the five full rows

type Spec = [code: string, label: string, w?: number]
/** Lay a row out left-to-right in 1u pitch. */
function row(y: number, keys: Spec[], opts: { h?: number; small?: boolean } = {}): MacKey[] {
  let x = 0
  return keys.map(([code, label, w = 1]) => {
    const k: MacKey = { code, label, x, y, w, ...(opts.h ? { h: opts.h } : {}), ...(opts.small ? { small: true } : {}) }
    x += w
    return k
  })
}

export const MACBOOK_LAYOUT: MacKey[] = [
  ...row(0, [
    ['escape', 'esc', 1.5],
    ...Array.from({ length: 12 }, (_, i): Spec => [`f${i + 1}`, `F${i + 1}`]),
    ['power', 'Touch ID'],
  ], { h: FN_H, small: true }),
  ...row(ROW(0), [
    ['grave_accent_and_tilde', '`'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['0', '0'], ['hyphen', '-'], ['equal_sign', '='], ['delete_or_backspace', 'delete', 1.5],
  ]),
  ...row(ROW(1), [
    ['tab', 'tab', 1.5], ['q', 'Q'], ['w', 'W'], ['e', 'E'], ['r', 'R'], ['t', 'T'], ['y', 'Y'], ['u', 'U'],
    ['i', 'I'], ['o', 'O'], ['p', 'P'], ['open_bracket', '['], ['close_bracket', ']'], ['backslash', '\\'],
  ]),
  ...row(ROW(2), [
    ['caps_lock', 'caps lock', 1.75], ['a', 'A'], ['s', 'S'], ['d', 'D'], ['f', 'F'], ['g', 'G'], ['h', 'H'],
    ['j', 'J'], ['k', 'K'], ['l', 'L'], ['semicolon', ';'], ['quote', "'"], ['return_or_enter', 'return', 1.75],
  ]),
  ...row(ROW(3), [
    ['left_shift', 'shift', 2.25], ['z', 'Z'], ['x', 'X'], ['c', 'C'], ['v', 'V'], ['b', 'B'], ['n', 'N'],
    ['m', 'M'], ['comma', ','], ['period', '.'], ['slash', '/'], ['right_shift', 'shift', 2.25],
  ]),
  ...row(ROW(4), [
    ['fn', 'fn'], ['left_control', '⌃'], ['left_option', '⌥'], ['left_command', '⌘', 1.25],
    ['spacebar', '', 5], ['right_command', '⌘', 1.25], ['right_option', '⌥'],
  ]),
  { code: 'left_arrow',  label: '←', x: 11.5, y: ROW(4) },
  { code: 'up_arrow',    label: '↑', x: 12.5, y: ROW(4),       h: 0.5 },
  { code: 'down_arrow',  label: '↓', x: 12.5, y: ROW(4) + 0.5, h: 0.5 },
  { code: 'right_arrow', label: '→', x: 13.5, y: ROW(4) },
]

const R5_Y = ROW(4)
const ROW_UNITS = 14.5

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
export const BOARD_WIDTH  = ROW_UNITS * (KEY_UNIT + KEY_GAP)
export const BOARD_HEIGHT = (R5_Y + 1) * (KEY_UNIT + KEY_GAP)
