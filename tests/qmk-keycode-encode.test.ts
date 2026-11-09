import { describe, expect, test } from 'bun:test'
import { encodeQmkKeycode, qmkKeycode } from '../src/lib/device/keycodes'

describe('encodeQmkKeycode round trip', () => {
  test('every decodable code 0..0x7FFF re-encodes to itself', () => {
    const byName = new Map<string, number[]>()
    for (let c = 0; c <= 0x7fff; c++) {
      const name = qmkKeycode(c).name
      if (name.startsWith('0x')) {
        // Hex literals parse to their own value (wrapped unknown basics print the inner hex only).
        expect(encodeQmkKeycode(name)).toBe(parseInt(name.slice(2), 16))
        continue
      }
      byName.set(name, [...(byName.get(name) ?? []), c])
    }
    let checked = 0
    for (const [name, codes] of byName) {
      // Wrapped unknown basics (e.g. LCTL(0x0002)) are refused on purpose: hex is top-level only.
      if (name.includes('0x')) { expect(encodeQmkKeycode(name)).toBeNull(); continue }
      // Names shared by several codes are the "right-hand bit with no modifier" variants
      // (e.g. 0x1004 prints as KC_A); the encoder must pick the canonical lowest code.
      if (codes.length > 1) {
        for (const extra of codes.slice(1)) expect(((extra >> 8) & 0x1f) === 0x10 || (extra & 0x1f) === 0x10 && extra >= 0x5000).toBe(true)
      }
      expect(encodeQmkKeycode(name)).toBe(codes[0])
      checked++
    }
    expect(checked).toBeGreaterThan(18000)
  })
})

describe('keymap.json spellings', () => {
  const cases: Array<[string, number]> = [
    ['KC_A', 0x04], ['KC_NO', 0x00], ['XXXXXXX', 0x00], ['_______', 0x01], ['KC_TRANSPARENT', 0x01], ['KC_TRNS', 0x01],
    ['KC_ENTER', 0x28], ['KC_ENT', 0x28], ['KC_ESCAPE', 0x29], ['KC_ESC', 0x29], ['KC_BACKSPACE', 0x2a], ['KC_BSPC', 0x2a],
    ['KC_SPACE', 0x2c], ['KC_SPC', 0x2c], ['KC_RIGHT', 0x4f], ['KC_RGHT', 0x4f], ['KC_LCTRL', 0xe0], ['KC_LCTL', 0xe0],
    ['KC_LSHIFT', 0xe1], ['KC_LGUI', 0xe3], ['KC_LCMD', 0xe3], ['KC_LWIN', 0xe3], ['KC_LOPT', 0xe2], ['KC_RALT', 0xe6], ['KC_ALGR', 0xe6],
    ['KC_KP_1', 0x59], ['KC_P1', 0x59], ['KC_VOLU', 0xa9], ['KC_AUDIO_VOL_UP', 0xa9], ['KC_BTN1', 0xd1], ['KC_WH_U', 0xd9],
    ['KC_EXLM', 0x021e], ['KC_TILD', 0x0235], ['KC_GESC', 0x7c16], ['QK_BOOTLOADER', 0x7c00], ['QK_BOOT', 0x7c00],
    ['LT(1,KC_SPC)', 0x412c], ['LT( 1 , KC_SPC )', 0x412c], ['LT(15, KC_A)', 0x4f04],
    ['LCTL_T(KC_A)', 0x2104], ['LSFT_T(KC_A)', 0x2204], ['LALT_T(KC_A)', 0x2404], ['LOPT_T(KC_A)', 0x2404],
    ['LGUI_T(KC_A)', 0x2804], ['LCMD_T(KC_A)', 0x2804], ['RCTL_T(KC_A)', 0x3104], ['RGUI_T(KC_A)', 0x3804],
    ['MEH_T(KC_A)', 0x2704], ['HYPR_T(KC_A)', 0x2f04], ['ALL_T(KC_A)', 0x2f04], ['C_S_T(KC_A)', 0x2304],
    ['MT(MOD_LCTL | MOD_LSFT, KC_A)', 0x2304], ['MT(MOD_RSFT,KC_A)', 0x3204],
    ['C(KC_A)', 0x0104], ['S(KC_A)', 0x0204], ['A(KC_A)', 0x0404], ['G(KC_A)', 0x0804],
    ['LCTL(KC_A)', 0x0104], ['RGUI(KC_A)', 0x1804], ['LCTL(LSFT(KC_A))', 0x0304], ['LSFT(LCTL(KC_A))', 0x0304],
    ['RCTL(RSFT(KC_A))', 0x1304], ['MEH(KC_A)', 0x0704], ['HYPR(KC_A)', 0x0f04], ['LCMD(KC_A)', 0x0804],
    ['OSM(MOD_LSFT)', 0x52a2], ['OSM(MOD_LCTL | MOD_LSFT)', 0x52a3], ['LM(1, MOD_LSFT)', 0x5022],
    ['MO(1)', 0x5221], ['TO(0)', 0x5200], ['DF(3)', 0x5243], ['TG(31)', 0x527f], ['OSL(2)', 0x5282], ['TT(4)', 0x52c4], ['PDF(1)', 0x52e1],
    ['TD(0)', 0x5700], ['TD(255)', 0x57ff], ['QK_MACRO_0', 0x7700], ['QK_MACRO_127', 0x777f], ['MC_3', 0x7703],
    ['QK_KB_0', 0x7e00], ['QK_USER_447', 0x7fff], ['BL_TOGG', 0x7802], ['RM_TOGG', 0x7842], ['UG_HUEU', 0x7823],
    ['QK_REPEAT_KEY', 0x7c77], ['QK_CAPS_WORD_TOGGLE', 0x7c73], ['0x7C00', 0x7c00], ['0x0002', 0x0002],
  ]
  for (const [name, code] of cases) {
    test(name, () => expect(encodeQmkKeycode(name)).toBe(code))
  }

  test('expected codes decode to the sensible names', () => {
    expect(qmkKeycode(0x412c).name).toBe('LT(1, KC_SPC)')
    expect(qmkKeycode(0x2304).name).toBe('MT(MOD_LCTL | MOD_LSFT, KC_A)')
    expect(qmkKeycode(0x021e).name).toBe('LSFT(KC_1)')
    expect(qmkKeycode(0x52a3).name).toBe('OSM(MOD_LCTL | MOD_LSFT)')
  })
})

describe('refusals', () => {
  const bad = [
    '', ' ', 'KC_NOPE', 'kc_a', 'KC_A)', '(KC_A', 'KC_A(', 'LT(1,KC_A))', 'LT(1,KC_A)x', 'LT(16, KC_A)', 'LT(-1, KC_A)', 'LT(01, KC_A)',
    'LT(1)', 'LT(1,KC_A,KC_B)', 'MO(32)', 'TO(x)', 'TD(256)', 'QK_MACRO_128', 'MC_32', 'QK_KB_64', 'QK_USER_448',
    'MT(MOD_LCTL | MOD_RSFT, KC_A)', 'MT(MOD_LCTL, LT(1,KC_A))', 'MT(MOD_LCTL, KC_EXLM)', 'MT(MOD_LCTL, 0x04)',
    'LCTL(LT(1,KC_A))', 'LCTL(MT(MOD_LCTL,KC_A))', 'LCTL(RSFT(KC_A))', 'RCTL(LSFT(KC_A))', 'LCTL(0x1004)', 'LCTL()',
    'OSM(MOD_LCTL | MOD_RGUI)', 'OSM(KC_A)', 'LM(16, MOD_LCTL)', '0x10000', '0xZZ', 'M(1)', 'MACRO_1', 'RESET',
  ]
  for (const name of bad) test(JSON.stringify(name), () => expect(encodeQmkKeycode(name)).toBeNull())
})
