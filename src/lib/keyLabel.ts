/**
 * Keycap labels for ZMK bindings.
 *
 * ZMK keycodes have several aliases for the same key (RIGHT / RIGHT_ARROW,
 * PLUS / KP_PLUS, TILDE / TILDE2 …). Every alias maps to the same glyph so the
 * board never shows "RIGH" next to "←" or "PLUS" next to "=".
 */

const KEY_SYMBOLS: Record<string, string> = {
  // arrows / navigation
  UP: '↑', UP_ARROW: '↑',
  DOWN: '↓', DOWN_ARROW: '↓',
  LEFT: '←', LEFT_ARROW: '←',
  RIGHT: '→', RIGHT_ARROW: '→',
  HOME: 'HOME', END: 'END',
  PG_UP: 'PGUP', PAGE_UP: 'PGUP', PG_DN: 'PGDN', PAGE_DOWN: 'PGDN',

  // symbols (shifted + unshifted names)
  TILDE: '~', TILDE2: '~', GRAVE: '`',
  EXCL: '!', EXCLAMATION: '!',
  AT: '@', AT_SIGN: '@',
  HASH: '#', POUND: '#',
  DLLR: '$', DOLLAR: '$',
  PRCNT: '%', PERCENT: '%',
  CARET: '^',
  AMPS: '&', AMPERSAND: '&',
  ASTRK: '*', ASTERISK: '*', STAR: '*', KP_ASTERISK: '*', KP_MULTIPLY: '*',
  LPAR: '(', LEFT_PARENTHESIS: '(', RPAR: ')', RIGHT_PARENTHESIS: ')',
  MINUS: '-', HYPHEN: '-', KP_MINUS: '-', KP_SUBTRACT: '-',
  UNDER: '_', UNDERSCORE: '_',
  EQUAL: '=', EQUAL_SIGN: '=', KP_EQUAL: '=',
  PLUS: '+', KP_PLUS: '+',
  LBKT: '[', LEFT_BRACKET: '[', RBKT: ']', RIGHT_BRACKET: ']',
  LBRC: '{', LEFT_BRACE: '{', RBRC: '}', RIGHT_BRACE: '}',
  BSLH: '\\', BACKSLASH: '\\', PIPE: '|', PIPE2: '|', NON_US_BSLH: '\\',
  SEMI: ';', SEMICOLON: ';', COLON: ':',
  SQT: "'", APOS: "'", APOSTROPHE: "'", DQT: '"', DOUBLE_QUOTES: '"',
  COMMA: ',', LT: '<', LESS_THAN: '<', KP_COMMA: ',',
  DOT: '.', PERIOD: '.', GT: '>', GREATER_THAN: '>', KP_DOT: '.',
  FSLH: '/', SLASH: '/', KP_SLASH: '/', KP_DIVIDE: '/',
  QMARK: '?', QUESTION: '?',

  // named keys
  SPACE: 'SPC',
  ENTER: 'ENT', RET: 'ENT', RETURN: 'ENT', RETURN_OR_ENTER: 'ENT', KP_ENTER: 'ENT',
  BACKSPACE: 'BSPC', BSPC: 'BSPC',
  ESC: 'ESC', ESCAPE: 'ESC',
  DELETE: 'DEL', DEL: 'DEL',
  TAB: 'TAB',
  CAPSLOCK: 'CAPS', CAPS: 'CAPS', CAPS_LOCK: 'CAPS',
  INSERT: 'INS', INS: 'INS',
  PRINTSCREEN: 'PRSC', PSCRN: 'PRSC',

  // modifiers
  LEFT_SHIFT: 'SFT', LSHFT: 'SFT', LSHIFT: 'SFT', LSFT: 'SFT',
  RIGHT_SHIFT: 'SFT', RSHFT: 'SFT', RSHIFT: 'SFT', RSFT: 'SFT',
  LEFT_CONTROL: 'CTL', LCTRL: 'CTL', LCTL: 'CTL',
  RIGHT_CONTROL: 'CTL', RCTRL: 'CTL', RCTL: 'CTL',
  LEFT_ALT: 'ALT', LALT: 'ALT', RIGHT_ALT: 'ALT', RALT: 'ALT',
  LEFT_COMMAND: 'CMD', LEFT_GUI: 'CMD', LGUI: 'CMD', LCMD: 'CMD', LEFT_WIN: 'CMD', LWIN: 'CMD', LMETA: 'CMD',
  RIGHT_COMMAND: 'CMD', RIGHT_GUI: 'CMD', RGUI: 'CMD', RCMD: 'CMD', RIGHT_WIN: 'CMD', RWIN: 'CMD', RMETA: 'CMD',

  // media / consumer
  C_VOL_UP: 'VOL+', C_VOLUME_UP: 'VOL+',
  C_VOL_DN: 'VOL-', C_VOLUME_DOWN: 'VOL-',
  K_MUTE: 'MUTE', C_MUTE: 'MUTE',
  C_PLAY_PAUSE: 'PLAY', C_PP: 'PLAY', C_PLAY: 'PLAY', C_PAUSE: 'PAUS',
  C_NEXT: 'NEXT', C_PREV: 'PREV', C_PREVIOUS: 'PREV',
  C_RW: 'RW', C_REWIND: 'RW', C_FF: 'FF', C_FAST_FORWARD: 'FF',
  C_BRIGHTNESS_INC: 'BRI+', C_BRI_UP: 'BRI+', C_BRIGHTNESS_DEC: 'BRI-', C_BRI_DN: 'BRI-',
  C_POWER: 'PWR', C_PWR: 'PWR',
  C_AC_SEARCH: 'SRCH', C_AL_CONTROL_PANEL: 'CTLP',
}

const MOD_GLYPH: Record<string, string> = {
  LG: '⌘', RG: '⌘', LC: '⌃', RC: '⌃', LS: '⇧', RS: '⇧', LA: '⌥', RA: '⌥',
}

const ZERO_ARG: Record<string, string> = {
  '&trans': '···',
  '&none': '·',
  '&bt BT_CLR': 'CLR',
  '&bt BT_CLR_ALL': 'CLR!',
  '&bt BT_NXT': 'BT→',
  '&bt BT_PRV': 'BT←',
  '&soft_off': 'OFF',
  '&sys_reset': 'RST',
  '&bootloader': 'BOOT',
  '&out OUT_TOG': 'OUT⇄',
  '&out OUT_USB': 'USB',
  '&out OUT_BLE': 'BLE',
  '&mkp LCLK': 'LC',
  '&mkp RCLK': 'RC',
  '&mkp MCLK': 'MC',
  '&mkp MB4': 'MB4',
  '&mkp MB5': 'MB5',
  '&caps_word': 'CAPW',
}

/** Label for a bare keycode expression: `A`, `N5`, `RIGHT`, `LG(LS(N4))`. */
export function keycodeLabel(code: string): string {
  const c = code.trim()
  if (/^[A-Z]$/.test(c)) return c
  const n = c.match(/^(?:N|NUMBER_|KP_N|KP_NUMBER_)([0-9])$/)
  if (n) return n[1]
  const f = c.match(/^F(1[0-9]|2[0-4]|[1-9])$/)
  if (f) return c
  // Modifier wrap, possibly nested: LG(LS(NUMBER_4)) → ⌘⇧4
  const wrap = c.match(/^([LR][GCSA])\((.+)\)$/)
  if (wrap) return MOD_GLYPH[wrap[1]] + keycodeLabel(wrap[2])
  return KEY_SYMBOLS[c] ?? c.slice(0, 4)
}

/** Short keycap label for a full ZMK binding string. */
export function bindingLabel(binding: string): string {
  const b = binding.trim()
  if (ZERO_ARG[b]) return ZERO_ARG[b]

  const kp = b.match(/^&kp\s+(.+)$/)
  if (kp) return keycodeLabel(kp[1])

  const mo = b.match(/^&mo\s+(\d+)$/)
  if (mo) return 'mo' + mo[1]

  const lt = b.match(/^&lt\s+(\d+)\s+/)
  if (lt) return 'LT' + lt[1]

  if (/^&mt\s+/.test(b)) return 'MT'

  const tog = b.match(/^&tog\s+(\d+)$/)
  if (tog) return 'tog' + tog[1]

  const sl = b.match(/^&sl\s+(\d+)$/)
  if (sl) return 'sl' + sl[1]

  const sk = b.match(/^&sk\s+(.+)$/)
  if (sk) return '⇢' + keycodeLabel(sk[1])

  const bt = b.match(/^&bt\s+BT_SEL\s+(\d+)$/)
  if (bt) return 'BT' + bt[1]

  // Custom user behavior (&and_bspc, &and_left …): label by the suffix after
  // the last underscore when it names a key, else the behavior name itself.
  const custom = b.match(/^&([A-Za-z0-9_]+)/)
  if (custom) {
    const name = custom[1]
    const suffix = name.slice(name.lastIndexOf('_') + 1).toUpperCase()
    if (KEY_SYMBOLS[suffix]) return KEY_SYMBOLS[suffix]
    return name.slice(0, 4)
  }

  return b.slice(0, 4)
}
