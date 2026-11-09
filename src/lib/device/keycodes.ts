/**
 * Keycode tables shared by the USB clients.
 *
 * - HID keyboard-page usages (USB HID Usage Tables §10) with their ZMK name
 *   (zmk app/include/dt-bindings/zmk/keys.h) and QMK name. ZMK Studio sends
 *   `&kp` params as `(mods << 24) | (page << 16) | usage`
 *   (zmk dt-bindings/zmk/hid_usage.h, modifiers.h APPLY_MODS).
 * - QMK 16-bit keycodes, keycode layout v0.0.x as used by VIA protocol ≥ 12
 *   and Vial protocol ≥ 6 (qmk_firmware quantum/keycodes.h: QK_BASIC,
 *   QK_MODS, QK_MOD_TAP, QK_LAYER_TAP, QK_TO … QK_USER ranges).
 *
 * Labels reuse the app's keycap glyphs (src/lib/keyLabel.ts) so a keyboard
 * read over USB looks the same as one read from a keymap file.
 */
import { bindingLabel, bindingSubLabel, keycodeLabel } from '../keyLabel'

// [usage, ZMK name, QMK name (without KC_)]
const KEYBOARD_PAGE: Array<[number, string, string]> = []
{
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i)
    KEYBOARD_PAGE.push([0x04 + i, c, c])
  }
  for (let i = 1; i <= 9; i++) KEYBOARD_PAGE.push([0x1d + i, `N${i}`, `${i}`])
  KEYBOARD_PAGE.push([0x27, 'N0', '0'])
  const named: Array<[number, string, string]> = [
    [0x28, 'RET', 'ENT'], [0x29, 'ESC', 'ESC'], [0x2a, 'BSPC', 'BSPC'], [0x2b, 'TAB', 'TAB'],
    [0x2c, 'SPACE', 'SPC'], [0x2d, 'MINUS', 'MINS'], [0x2e, 'EQUAL', 'EQL'], [0x2f, 'LBKT', 'LBRC'],
    [0x30, 'RBKT', 'RBRC'], [0x31, 'BSLH', 'BSLS'], [0x32, 'NON_US_HASH', 'NUHS'], [0x33, 'SEMI', 'SCLN'],
    [0x34, 'SQT', 'QUOT'], [0x35, 'GRAVE', 'GRV'], [0x36, 'COMMA', 'COMM'], [0x37, 'DOT', 'DOT'],
    [0x38, 'FSLH', 'SLSH'], [0x39, 'CAPS', 'CAPS'],
    [0x46, 'PSCRN', 'PSCR'], [0x47, 'SLCK', 'SCRL'], [0x48, 'PAUSE_BREAK', 'PAUS'], [0x49, 'INS', 'INS'],
    [0x4a, 'HOME', 'HOME'], [0x4b, 'PG_UP', 'PGUP'], [0x4c, 'DEL', 'DEL'], [0x4d, 'END', 'END'],
    [0x4e, 'PG_DN', 'PGDN'], [0x4f, 'RIGHT', 'RGHT'], [0x50, 'LEFT', 'LEFT'], [0x51, 'DOWN', 'DOWN'],
    [0x52, 'UP', 'UP'], [0x53, 'KP_NUM', 'NUM'], [0x54, 'KP_SLASH', 'PSLS'], [0x55, 'KP_MULTIPLY', 'PAST'],
    [0x56, 'KP_MINUS', 'PMNS'], [0x57, 'KP_PLUS', 'PPLS'], [0x58, 'KP_ENTER', 'PENT'],
    [0x62, 'KP_N0', 'P0'], [0x63, 'KP_DOT', 'PDOT'], [0x64, 'NON_US_BSLH', 'NUBS'], [0x65, 'K_APP', 'APP'],
    [0x66, 'K_POWER', 'KB_POWER'], [0x67, 'KP_EQUAL', 'PEQL'],
    [0x74, 'K_EXEC', 'EXEC'], [0x75, 'K_HELP', 'HELP'], [0x76, 'K_MENU', 'MENU'], [0x77, 'K_SELECT', 'SLCT'],
    [0x78, 'K_STOP', 'STOP'], [0x79, 'K_AGAIN', 'AGIN'], [0x7a, 'K_UNDO', 'UNDO'], [0x7b, 'K_CUT', 'CUT'],
    [0x7c, 'K_COPY', 'COPY'], [0x7d, 'K_PASTE', 'PSTE'], [0x7e, 'K_FIND', 'FIND'], [0x7f, 'K_MUTE', 'KB_MUTE'],
    [0x80, 'K_VOL_UP', 'KB_VOLUME_UP'], [0x81, 'K_VOL_DN', 'KB_VOLUME_DOWN'], [0x82, 'LOCKING_CAPS', 'LCAP'],
    [0x83, 'LOCKING_NUM', 'LNUM'], [0x84, 'LOCKING_SCROLL', 'LSCR'], [0x85, 'KP_COMMA', 'PCMM'],
    [0x86, 'KP_EQUAL_AS400', 'KP_EQUAL_AS400'],
    [0x99, 'ALT_ERASE', 'ERAS'], [0x9a, 'SYSREQ', 'SYRQ'], [0x9b, 'K_CANCEL', 'CNCL'], [0x9c, 'CLEAR', 'CLR'],
    [0x9d, 'PRIOR', 'PRIR'], [0x9e, 'RET2', 'RETN'], [0x9f, 'SEPARATOR', 'SEPR'], [0xa0, 'OUT', 'OUT'],
    [0xa1, 'OPER', 'OPER'], [0xa2, 'CLEAR_AGAIN', 'CLAG'], [0xa3, 'CRSEL', 'CRSL'], [0xa4, 'EXSEL', 'EXSL'],
    [0xe0, 'LCTRL', 'LCTL'], [0xe1, 'LSHFT', 'LSFT'], [0xe2, 'LALT', 'LALT'], [0xe3, 'LGUI', 'LGUI'],
    [0xe4, 'RCTRL', 'RCTL'], [0xe5, 'RSHFT', 'RSFT'], [0xe6, 'RALT', 'RALT'], [0xe7, 'RGUI', 'RGUI'],
  ]
  KEYBOARD_PAGE.push(...named)
  for (let i = 1; i <= 12; i++) KEYBOARD_PAGE.push([0x39 + i, `F${i}`, `F${i}`])
  for (let i = 13; i <= 24; i++) KEYBOARD_PAGE.push([0x68 + i - 13, `F${i}`, `F${i}`])
  for (let i = 1; i <= 9; i++) KEYBOARD_PAGE.push([0x58 + i, `KP_N${i}`, `P${i}`])
  for (let i = 1; i <= 9; i++) KEYBOARD_PAGE.push([0x86 + i, `INT${i}`, `INT${i}`])
  for (let i = 1; i <= 9; i++) KEYBOARD_PAGE.push([0x8f + i, `LANG${i}`, `LNG${i}`])
}

const ZMK_BY_USAGE = new Map<number, string>(KEYBOARD_PAGE.map(([u, z]) => [u, z]))
const QMK_BY_USAGE = new Map<number, string>(KEYBOARD_PAGE.map(([u, , q]) => [u, q]))

/** Consumer page (0x0C) usages with ZMK names (zmk dt-bindings/zmk/keys.h). */
const CONSUMER: Record<number, string> = {
  0x30: 'C_PWR', 0x6f: 'C_BRI_UP', 0x70: 'C_BRI_DN', 0xb3: 'C_FF', 0xb4: 'C_RW', 0xb5: 'C_NEXT',
  0xb6: 'C_PREV', 0xb7: 'C_STOP', 0xcd: 'C_PP', 0xe2: 'C_MUTE', 0xe9: 'C_VOL_UP', 0xea: 'C_VOL_DN',
  0x221: 'C_AC_SEARCH', 0x192: 'C_AL_CALC', 0x9f: 'C_AL_CONTROL_PANEL',
}

const HID_PAGE_KEYBOARD = 0x07
const HID_PAGE_CONSUMER = 0x0c

/** ZMK implicit-modifier wrappers, bit order of zmk dt-bindings/zmk/modifiers.h. */
const ZMK_MOD_WRAP = ['LC', 'LS', 'LA', 'LG', 'RC', 'RS', 'RA', 'RG']

/** ZMK keycode expression for a Studio HID-usage param, e.g. 0x02070004 → `LS(A)`. */
export function hidUsageToZmk(value: number): string {
  const v = value >>> 0
  const mods = (v >>> 24) & 0xff
  const page = (v >>> 16) & 0xff
  const id = v & 0xffff
  let base: string | undefined
  if (page === HID_PAGE_KEYBOARD || page === 0) base = ZMK_BY_USAGE.get(id)
  else if (page === HID_PAGE_CONSUMER) base = CONSUMER[id]
  if (!base) base = '0x' + (((page << 16) | id) >>> 0).toString(16)
  for (let bit = 0; bit < 8; bit++) {
    if (mods & (1 << bit)) base = `${ZMK_MOD_WRAP[bit]}(${base})`
  }
  return base
}

/** Studio HID-usage param for a ZMK keyboard-page name (inverse of hidUsageToZmk, no mods). */
export function zmkNameToHidUsage(name: string): number | undefined {
  for (const [u, z] of KEYBOARD_PAGE) if (z === name) return ((HID_PAGE_KEYBOARD << 16) | u) >>> 0
  for (const [u, z] of Object.entries(CONSUMER)) if (z === name) return ((HID_PAGE_CONSUMER << 16) | Number(u)) >>> 0
  return undefined
}

// ── QMK 16-bit keycodes ─────────────────────────────────────────────────────

/** QMK-only codes inside QK_BASIC (0xA5–0xDF): system, consumer, mouse keys. */
const QMK_EXTRA: Record<number, [string, string]> = {
  0xa5: ['PWR', 'PWR'], 0xa6: ['SLEP', 'SLEP'], 0xa7: ['WAKE', 'WAKE'], 0xa8: ['MUTE', 'MUTE'],
  0xa9: ['VOLU', 'VOL+'], 0xaa: ['VOLD', 'VOL-'], 0xab: ['MNXT', 'NEXT'], 0xac: ['MPRV', 'PREV'],
  0xad: ['MSTP', 'STOP'], 0xae: ['MPLY', 'PLAY'], 0xaf: ['MSEL', 'MSEL'], 0xb0: ['EJCT', 'EJCT'],
  0xb1: ['MAIL', 'MAIL'], 0xb2: ['CALC', 'CALC'], 0xb3: ['MYCM', 'MYCM'], 0xb4: ['WSCH', 'SRCH'],
  0xb5: ['WHOM', 'WHOM'], 0xb6: ['WBAK', 'BACK'], 0xb7: ['WFWD', 'FWD'], 0xb8: ['WSTP', 'WSTP'],
  0xb9: ['WREF', 'REFR'], 0xba: ['WFAV', 'FAV'], 0xbb: ['MFFD', 'FF'], 0xbc: ['MRWD', 'RW'],
  0xbd: ['BRIU', 'BRI+'], 0xbe: ['BRID', 'BRI-'], 0xbf: ['CPNL', 'CTLP'], 0xc0: ['ASST', 'ASST'],
  0xc1: ['MCTL', 'MCTL'], 0xc2: ['LPAD', 'LPAD'],
  0xcd: ['MS_UP', 'M↑'], 0xce: ['MS_DOWN', 'M↓'], 0xcf: ['MS_LEFT', 'M←'], 0xd0: ['MS_RGHT', 'M→'],
  0xd1: ['MS_BTN1', 'LC'], 0xd2: ['MS_BTN2', 'RC'], 0xd3: ['MS_BTN3', 'MC'], 0xd4: ['MS_BTN4', 'MB4'],
  0xd5: ['MS_BTN5', 'MB5'], 0xd6: ['MS_BTN6', 'MB6'], 0xd7: ['MS_BTN7', 'MB7'], 0xd8: ['MS_BTN8', 'MB8'],
  0xd9: ['MS_WHLU', 'W↑'], 0xda: ['MS_WHLD', 'W↓'], 0xdb: ['MS_WHLL', 'W←'], 0xdc: ['MS_WHLR', 'W→'],
  0xdd: ['MS_ACL0', 'ACL0'], 0xde: ['MS_ACL1', 'ACL1'], 0xdf: ['MS_ACL2', 'ACL2'],
}

/** QMK 5-bit mod mask (quantum/modifiers.h): C S A G, bit 4 = right hand. */
const QMK_MOD_NAMES = ['CTL', 'SFT', 'ALT', 'GUI']
const MOD_GLYPH = ['⌃', '⇧', '⌥', '⌘']

function modMaskName(mask: number, style: 'MOD' | 'WRAP'): string[] {
  const side = mask & 0x10 ? 'R' : 'L'
  const out: string[] = []
  for (let b = 0; b < 4; b++) if (mask & (1 << b)) out.push(style === 'MOD' ? `MOD_${side}${QMK_MOD_NAMES[b]}` : `${side}${QMK_MOD_NAMES[b]}`)
  return out
}

function modGlyphs(mask: number): string {
  let s = ''
  for (let b = 0; b < 4; b++) if (mask & (1 << b)) s += MOD_GLYPH[b]
  return s
}

export interface QmkKeycode {
  /** 16-bit keycode as stored in the dynamic keymap. */
  code: number
  /** QMK source name, e.g. `KC_A`, `LT(1, KC_SPC)`, `MO(2)`; hex when unknown. */
  name: string
  /** Short keycap label in the app's glyph style. */
  label: string
  /** Hold / behavior cue shown under the label. */
  sub?: string
}

function basic(code: number): { name: string; label: string } {
  if (code === 0x00) return { name: 'KC_NO', label: bindingLabel('&none') }
  if (code === 0x01) return { name: 'KC_TRNS', label: bindingLabel('&trans') }
  const zmk = ZMK_BY_USAGE.get(code)
  const qmk = QMK_BY_USAGE.get(code)
  if (zmk && qmk) return { name: `KC_${qmk}`, label: keycodeLabel(zmk) }
  const extra = QMK_EXTRA[code]
  if (extra) return { name: `KC_${extra[0]}`, label: extra[1] }
  return { name: hex(code), label: hex(code) }
}

function hex(code: number): string {
  return '0x' + code.toString(16).toUpperCase().padStart(4, '0')
}

const LAYER_OPS: Array<[number, string, string]> = [
  [0x5200, 'TO', 'go to'], [0x5220, 'MO', 'hold'], [0x5240, 'DF', 'default'], [0x5260, 'TG', 'toggle'],
  [0x5280, 'OSL', 'sticky'], [0x52c0, 'TT', 'tap-toggle'], [0x52e0, 'PDF', 'default'],
]

const QUANTUM: Record<number, [string, string]> = {
  0x7c00: ['QK_BOOT', 'BOOT'], 0x7c01: ['QK_REBOOT', 'RST'], 0x7c02: ['QK_DEBUG_TOGGLE', 'DBG'],
  0x7c03: ['QK_CLEAR_EEPROM', 'EECLR'], 0x7c04: ['QK_MAKE', 'MAKE'], 0x7c16: ['QK_GRAVE_ESCAPE', 'ESC`'],
  0x7c73: ['QK_CAPS_WORD_TOGGLE', 'CAPW'], 0x7c77: ['QK_REPEAT_KEY', 'REP'],
}

const LIGHTING: Record<number, [string, string]> = {
  0x7800: ['BL_ON', 'BL on'], 0x7801: ['BL_OFF', 'BL off'], 0x7802: ['BL_TOGG', 'BL'], 0x7803: ['BL_DOWN', 'BL-'],
  0x7804: ['BL_UP', 'BL+'], 0x7805: ['BL_STEP', 'BL»'], 0x7806: ['BL_BRTG', 'BRTG'],
  0x7820: ['UG_TOGG', 'RGB'], 0x7821: ['UG_NEXT', 'RGB»'], 0x7822: ['UG_PREV', 'RGB«'], 0x7823: ['UG_HUEU', 'HUE+'],
  0x7824: ['UG_HUED', 'HUE-'], 0x7825: ['UG_SATU', 'SAT+'], 0x7826: ['UG_SATD', 'SAT-'], 0x7827: ['UG_VALU', 'BRI+'],
  0x7828: ['UG_VALD', 'BRI-'], 0x7829: ['UG_SPDU', 'SPD+'], 0x782a: ['UG_SPDD', 'SPD-'],
  0x7840: ['RM_ON', 'RGB on'], 0x7841: ['RM_OFF', 'RGB off'], 0x7842: ['RM_TOGG', 'RGB'], 0x7843: ['RM_NEXT', 'RGB»'],
  0x7844: ['RM_PREV', 'RGB«'], 0x7845: ['RM_HUEU', 'HUE+'], 0x7846: ['RM_HUED', 'HUE-'], 0x7847: ['RM_SATU', 'SAT+'],
  0x7848: ['RM_SATD', 'SAT-'], 0x7849: ['RM_VALU', 'BRI+'], 0x784a: ['RM_VALD', 'BRI-'], 0x784b: ['RM_SPDU', 'SPD+'],
  0x784c: ['RM_SPDD', 'SPD-'],
}

/** Decode a QMK 16-bit keycode (keycodes v0.0.x) into name + label. */
export function qmkKeycode(code: number): QmkKeycode {
  const c = code & 0xffff
  if (c <= 0x00ff) return { code: c, ...basic(c) }
  if (c <= 0x1fff) {
    const mods = (c >> 8) & 0x1f
    const k = basic(c & 0xff)
    const name = modMaskName(mods, 'WRAP').reduceRight((inner, m) => `${m}(${inner})`, k.name)
    return { code: c, name, label: modGlyphs(mods) + k.label, sub: 'shortcut' }
  }
  if (c <= 0x3fff) {
    const mods = (c >> 8) & 0x1f
    const k = basic(c & 0xff)
    return { code: c, name: `MT(${modMaskName(mods, 'MOD').join(' | ') || '0'}, ${k.name})`, label: k.label, sub: `hold ${modGlyphs(mods)}` }
  }
  if (c <= 0x4fff) {
    const layer = (c >> 8) & 0x0f
    const k = basic(c & 0xff)
    return { code: c, name: `LT(${layer}, ${k.name})`, label: k.label, sub: `hold L${layer}` }
  }
  if (c <= 0x51ff) {
    const layer = (c >> 5) & 0x0f
    const mods = c & 0x1f
    return { code: c, name: `LM(${layer}, ${modMaskName(mods, 'MOD').join(' | ') || '0'})`, label: `L${layer}`, sub: `hold ${modGlyphs(mods)}` }
  }
  for (const [base, op, sub] of LAYER_OPS) {
    if (c >= base && c <= base + 0x1f) return { code: c, name: `${op}(${c - base})`, label: `L${c - base}`, sub }
  }
  if (c >= 0x52a0 && c <= 0x52bf) {
    const mods = c & 0x1f
    return { code: c, name: `OSM(${modMaskName(mods, 'MOD').join(' | ') || '0'})`, label: modGlyphs(mods) || 'OSM', sub: 'sticky' }
  }
  if (c >= 0x5700 && c <= 0x57ff) return { code: c, name: `TD(${c & 0xff})`, label: `TD${c & 0xff}`, sub: 'tap dance' }
  if (c >= 0x7700 && c <= 0x777f) return { code: c, name: `QK_MACRO_${c & 0x7f}`, label: `M${c & 0x7f}`, sub: 'macro' }
  if (LIGHTING[c]) return { code: c, name: LIGHTING[c][0], label: LIGHTING[c][1], sub: 'lighting' }
  if (c >= 0x7800 && c <= 0x78ff) return { code: c, name: hex(c), label: 'LED', sub: 'lighting' }
  if (QUANTUM[c]) return { code: c, name: QUANTUM[c][0], label: QUANTUM[c][1], sub: 'system' }
  if (c >= 0x7e00 && c <= 0x7e3f) return { code: c, name: `QK_KB_${c - 0x7e00}`, label: `KB${c - 0x7e00}`, sub: 'custom' }
  if (c >= 0x7e40 && c <= 0x7fff) return { code: c, name: `QK_USER_${c - 0x7e40}`, label: `U${c - 0x7e40}`, sub: 'custom' }
  return { code: c, name: hex(c), label: hex(c) }
}

/** Keycap label + sub-label for a ZMK binding string built from Studio data. */
export function zmkBindingLabels(binding: string): { label: string; sub?: string } {
  return { label: bindingLabel(binding), sub: bindingSubLabel(binding) }
}

// ── QMK name → 16-bit keycode (inverse of qmkKeycode) ───────────────────────

/** Long / legacy spellings found in keymap.json, mapped to the canonical name qmkKeycode() prints. */
const QMK_ALIASES: Array<[string, string]> = [
  ['KC_TRANSPARENT', 'KC_TRNS'], ['KC_ENTER', 'KC_ENT'], ['KC_ESCAPE', 'KC_ESC'], ['KC_BACKSPACE', 'KC_BSPC'],
  ['KC_SPACE', 'KC_SPC'], ['KC_MINUS', 'KC_MINS'], ['KC_EQUAL', 'KC_EQL'], ['KC_LEFT_BRACKET', 'KC_LBRC'],
  ['KC_RIGHT_BRACKET', 'KC_RBRC'], ['KC_BACKSLASH', 'KC_BSLS'], ['KC_NONUS_HASH', 'KC_NUHS'],
  ['KC_SEMICOLON', 'KC_SCLN'], ['KC_QUOTE', 'KC_QUOT'], ['KC_GRAVE', 'KC_GRV'], ['KC_COMMA', 'KC_COMM'],
  ['KC_SLASH', 'KC_SLSH'], ['KC_CAPS_LOCK', 'KC_CAPS'], ['KC_PRINT_SCREEN', 'KC_PSCR'],
  ['KC_SCROLL_LOCK', 'KC_SCRL'], ['KC_PAUSE', 'KC_PAUS'], ['KC_INSERT', 'KC_INS'], ['KC_DELETE', 'KC_DEL'],
  ['KC_PAGE_UP', 'KC_PGUP'], ['KC_PAGE_DOWN', 'KC_PGDN'], ['KC_RIGHT', 'KC_RGHT'], ['KC_NUM_LOCK', 'KC_NUM'],
  ['KC_KP_SLASH', 'KC_PSLS'], ['KC_KP_ASTERISK', 'KC_PAST'], ['KC_KP_MINUS', 'KC_PMNS'], ['KC_KP_PLUS', 'KC_PPLS'],
  ['KC_KP_ENTER', 'KC_PENT'], ['KC_KP_0', 'KC_P0'], ['KC_KP_DOT', 'KC_PDOT'], ['KC_KP_EQUAL', 'KC_PEQL'],
  ['KC_NONUS_BACKSLASH', 'KC_NUBS'], ['KC_APPLICATION', 'KC_APP'],
  ['KC_LCTRL', 'KC_LCTL'], ['KC_LSHIFT', 'KC_LSFT'], ['KC_LOPT', 'KC_LALT'], ['KC_LCMD', 'KC_LGUI'], ['KC_LWIN', 'KC_LGUI'],
  ['KC_RCTRL', 'KC_RCTL'], ['KC_RSHIFT', 'KC_RSFT'], ['KC_ROPT', 'KC_RALT'], ['KC_ALGR', 'KC_RALT'],
  ['KC_RCMD', 'KC_RGUI'], ['KC_RWIN', 'KC_RGUI'],
  ['KC_LEFT_CTRL', 'KC_LCTL'], ['KC_LEFT_SHIFT', 'KC_LSFT'], ['KC_LEFT_ALT', 'KC_LALT'], ['KC_LEFT_GUI', 'KC_LGUI'],
  ['KC_RIGHT_CTRL', 'KC_RCTL'], ['KC_RIGHT_SHIFT', 'KC_RSFT'], ['KC_RIGHT_ALT', 'KC_RALT'], ['KC_RIGHT_GUI', 'KC_RGUI'],
  ['KC_SYSTEM_POWER', 'KC_PWR'], ['KC_SYSTEM_SLEEP', 'KC_SLEP'], ['KC_SYSTEM_WAKE', 'KC_WAKE'],
  ['KC_AUDIO_MUTE', 'KC_MUTE'], ['KC_AUDIO_VOL_UP', 'KC_VOLU'], ['KC_AUDIO_VOL_DOWN', 'KC_VOLD'],
  ['KC_MEDIA_NEXT_TRACK', 'KC_MNXT'], ['KC_MEDIA_PREV_TRACK', 'KC_MPRV'], ['KC_MEDIA_STOP', 'KC_MSTP'],
  ['KC_MEDIA_PLAY_PAUSE', 'KC_MPLY'], ['KC_MEDIA_SELECT', 'KC_MSEL'], ['KC_MEDIA_EJECT', 'KC_EJCT'],
  ['KC_MY_COMPUTER', 'KC_MYCM'], ['KC_BRIGHTNESS_UP', 'KC_BRIU'], ['KC_BRIGHTNESS_DOWN', 'KC_BRID'],
  ['KC_MS_U', 'KC_MS_UP'], ['KC_MS_D', 'KC_MS_DOWN'], ['KC_MS_L', 'KC_MS_LEFT'], ['KC_MS_R', 'KC_MS_RGHT'],
  ['KC_MS_RIGHT', 'KC_MS_RGHT'],
  ['KC_BTN1', 'KC_MS_BTN1'], ['KC_BTN2', 'KC_MS_BTN2'], ['KC_BTN3', 'KC_MS_BTN3'], ['KC_BTN4', 'KC_MS_BTN4'],
  ['KC_BTN5', 'KC_MS_BTN5'], ['KC_BTN6', 'KC_MS_BTN6'], ['KC_BTN7', 'KC_MS_BTN7'], ['KC_BTN8', 'KC_MS_BTN8'],
  ['KC_WH_U', 'KC_MS_WHLU'], ['KC_WH_D', 'KC_MS_WHLD'], ['KC_WH_L', 'KC_MS_WHLL'], ['KC_WH_R', 'KC_MS_WHLR'],
  ['KC_ACL0', 'KC_MS_ACL0'], ['KC_ACL1', 'KC_MS_ACL1'], ['KC_ACL2', 'KC_MS_ACL2'],
  ['QK_BOOTLOADER', 'QK_BOOT'], ['QK_GESC', 'QK_GRAVE_ESCAPE'], ['KC_GESC', 'QK_GRAVE_ESCAPE'],
  ['CW_TOGG', 'QK_CAPS_WORD_TOGGLE'], ['DB_TOGG', 'QK_DEBUG_TOGGLE'], ['EE_CLR', 'QK_CLEAR_EEPROM'],
]

/** Shifted-symbol keycodes (quantum/quantum_keycodes: KC_TILD = S(KC_GRV) …) → LSFT(basic). */
const QMK_SHIFTED: Array<[string, string]> = [
  ['KC_TILD', 'KC_GRV'], ['KC_EXLM', 'KC_1'], ['KC_AT', 'KC_2'], ['KC_HASH', 'KC_3'], ['KC_DLR', 'KC_4'],
  ['KC_PERC', 'KC_5'], ['KC_CIRC', 'KC_6'], ['KC_AMPR', 'KC_7'], ['KC_ASTR', 'KC_8'], ['KC_LPRN', 'KC_9'],
  ['KC_RPRN', 'KC_0'], ['KC_UNDS', 'KC_MINS'], ['KC_PLUS', 'KC_EQL'], ['KC_LCBR', 'KC_LBRC'],
  ['KC_RCBR', 'KC_RBRC'], ['KC_PIPE', 'KC_BSLS'], ['KC_COLN', 'KC_SCLN'], ['KC_DQUO', 'KC_QUOT'],
  ['KC_DQT', 'KC_QUOT'], ['KC_LABK', 'KC_COMM'], ['KC_LT', 'KC_COMM'], ['KC_RABK', 'KC_DOT'], ['KC_GT', 'KC_DOT'],
  ['KC_QUES', 'KC_SLSH'],
]

/** Mod-wrap function names → 5-bit mask (bit 4 = right hand). */
const QMK_WRAP_MASKS: Record<string, number> = {
  LCTL: 0x01, LSFT: 0x02, LALT: 0x04, LGUI: 0x08, RCTL: 0x11, RSFT: 0x12, RALT: 0x14, RGUI: 0x18,
  C: 0x01, S: 0x02, A: 0x04, G: 0x08, LOPT: 0x04, LCMD: 0x08, LWIN: 0x08, ROPT: 0x14, RCMD: 0x18, RWIN: 0x18,
  ALGR: 0x14, MEH: 0x07, HYPR: 0x0f,
}

/** Mod-tap shorthand `X_T(kc)` → mask. */
const QMK_MT_MASKS: Record<string, number> = {
  LCTL_T: 0x01, LSFT_T: 0x02, LALT_T: 0x04, LGUI_T: 0x08, RCTL_T: 0x11, RSFT_T: 0x12, RALT_T: 0x14, RGUI_T: 0x18,
  CTL_T: 0x01, SFT_T: 0x02, ALT_T: 0x04, GUI_T: 0x08, LOPT_T: 0x04, LCMD_T: 0x08, LWIN_T: 0x08,
  OPT_T: 0x04, CMD_T: 0x08, WIN_T: 0x08, ROPT_T: 0x14, RCMD_T: 0x18, RWIN_T: 0x18, ALGR_T: 0x14,
  C_S_T: 0x03, LCS_T: 0x03, LCA_T: 0x05, LSA_T: 0x06, LCG_T: 0x09, LSG_T: 0x0a, LAG_T: 0x0c, LCAG_T: 0x0d,
  MEH_T: 0x07, HYPR_T: 0x0f, ALL_T: 0x0f,
}

/** `MOD_*` operands of MT / LM / OSM, same masks as the decoder prints. */
const QMK_MOD_BITS: Record<string, number> = {
  MOD_LCTL: 0x01, MOD_LSFT: 0x02, MOD_LALT: 0x04, MOD_LGUI: 0x08,
  MOD_RCTL: 0x11, MOD_RSFT: 0x12, MOD_RALT: 0x14, MOD_RGUI: 0x18,
  MOD_MEH: 0x07, MOD_HYPR: 0x0f,
}

let nameTable: Map<string, number> | undefined

function qmkNameTable(): Map<string, number> {
  if (nameTable) return nameTable
  const t = new Map<string, number>()
  const add = (name: string, code: number) => { if (!t.has(name)) t.set(name, code) }
  for (let c = 0; c <= 0xff; c++) { const n = qmkKeycode(c).name; if (!n.startsWith('0x')) add(n, c) }
  for (const table of [LIGHTING, QUANTUM]) for (const [c, [n]] of Object.entries(table)) add(n, Number(c))
  for (const [alias, canon] of QMK_ALIASES) { const c = t.get(canon); if (c !== undefined) add(alias, c) }
  for (let i = 1; i <= 9; i++) add(`KC_KP_${i}`, t.get(`KC_P${i}`)!)
  for (const [alias, base] of QMK_SHIFTED) add(alias, 0x0200 | t.get(base)!)
  add('_______', 0x01); add('XXXXXXX', 0x00)
  nameTable = t
  return t
}

/** Split `a,b(c,d),e` at top-level commas; null when parentheses are unbalanced. */
function splitArgs(s: string): string[] | null {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')' && --depth < 0) return null
    else if (s[i] === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1 }
  }
  if (depth !== 0) return null
  out.push(s.slice(start))
  return out
}

const DEC = /^(0|[1-9][0-9]*)$/
function dec(s: string, max: number): number | null {
  if (!DEC.test(s)) return null
  const n = Number(s)
  return n <= max ? n : null
}

/** `MOD_LCTL|MOD_LSFT` / `0` → 5-bit mask; mixed hands are not representable. */
function modExpr(s: string): number | null {
  if (s === '0') return 0
  let lo = 0
  let hand: number | undefined
  for (const term of s.split('|')) {
    const m = QMK_MOD_BITS[term]
    if (m === undefined) return null
    if (hand !== undefined && hand !== (m & 0x10)) return null
    hand = m & 0x10
    lo |= m & 0x0f
  }
  return lo | (hand ?? 0)
}

function encodeInner(s: string): number | null {
  const call = /^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/.exec(s)
  if (!call) return qmkNameTable().get(s) ?? null
  const [, fn, inside] = call
  const args = splitArgs(inside)
  if (!args) return null
  const one = args.length === 1 ? args[0] : null
  const wrapMask = QMK_WRAP_MASKS[fn]
  if (wrapMask !== undefined && one !== null) {
    const k = encodeInner(one)
    if (k === null || k > 0x1fff) return null
    const innerMask = k >> 8
    if (innerMask && (innerMask & 0x10) !== (wrapMask & 0x10)) return null
    return (k & 0xff) | (((innerMask & 0x0f) | wrapMask) << 8)
  }
  const mtMask = QMK_MT_MASKS[fn]
  if (mtMask !== undefined && one !== null) {
    const k = encodeInner(one)
    return k === null || k > 0xff ? null : 0x2000 | (mtMask << 8) | k
  }
  if (fn === 'MT' && args.length === 2) {
    const mask = modExpr(args[0])
    const k = encodeInner(args[1])
    return mask === null || k === null || k > 0xff ? null : 0x2000 | (mask << 8) | k
  }
  if (fn === 'LT' && args.length === 2) {
    const layer = dec(args[0], 15)
    const k = encodeInner(args[1])
    return layer === null || k === null || k > 0xff ? null : 0x4000 | (layer << 8) | k
  }
  if (fn === 'LM' && args.length === 2) {
    const layer = dec(args[0], 15)
    const mask = modExpr(args[1])
    return layer === null || mask === null ? null : 0x5000 | (layer << 5) | mask
  }
  if (fn === 'OSM' && one !== null) {
    const mask = modExpr(one)
    return mask === null ? null : 0x52a0 | mask
  }
  if (one !== null) {
    const op = LAYER_OPS.find(([, name]) => name === fn)
    if (op) { const n = dec(one, 31); return n === null ? null : op[0] + n }
    if (fn === 'TD') { const n = dec(one, 255); return n === null ? null : 0x5700 + n }
  }
  return null
}

/**
 * Inverse of qmkKeycode(): QMK keycode name (as printed by qmkKeycode or written in
 * keymap.json / VIA exports) → 16-bit keycode. Returns null for unknown or ambiguous
 * names; never guesses. `0x....` hex literals parse as-is (top level only).
 */
export function encodeQmkKeycode(name: string): number | null {
  const s = name.replace(/\s+/g, '')
  if (!s) return null
  if (/^0x[0-9a-fA-F]{1,4}$/.test(s)) return parseInt(s.slice(2), 16)
  const m = /^(QK_MACRO_|MC_|QK_KB_|QK_USER_)(.+)$/.exec(s)
  if (m) {
    const [, prefix, rest] = m
    const max = prefix === 'QK_MACRO_' ? 127 : prefix === 'MC_' ? 31 : prefix === 'QK_KB_' ? 63 : 447
    const n = dec(rest, max)
    if (n === null) return null
    return prefix === 'QK_MACRO_' || prefix === 'MC_' ? 0x7700 + n : prefix === 'QK_KB_' ? 0x7e00 + n : 0x7e40 + n
  }
  return encodeInner(s)
}
