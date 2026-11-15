import { describe, expect, test } from 'bun:test'
import { DEFAULT_RULES, HYPER_CAPS_RULE, hasHyperCaps, macDefaultRules, withHyperCaps } from '../src/lib/macDefaults'
import { macKeyFace } from '../src/lib/macKeymapView'
import { MACBOOK_LAYOUT } from '../src/lib/macbookLayout'
import { createNativeProfile } from '../src/lib/nativeRemapping'

describe('Caps Lock as Hyper (hold) and Escape (tap)', () => {
  test('the default profile is unchanged unless Hyper is asked for', () => {
    expect(macDefaultRules()).toEqual(DEFAULT_RULES)
    expect(hasHyperCaps(macDefaultRules())).toBe(false)
    expect(hasHyperCaps(macDefaultRules({ hyperCaps: true }))).toBe(true)
  })
  test('toggle adds one rule, keeps the rest in order, never duplicates and never mutates', () => {
    const before = structuredClone(DEFAULT_RULES)
    const on = withHyperCaps(DEFAULT_RULES, true)
    expect(DEFAULT_RULES).toEqual(before)
    expect(on).toHaveLength(DEFAULT_RULES.length + 1)
    expect(on.slice(0, -1)).toEqual(DEFAULT_RULES)
    expect(withHyperCaps(on, true)).toEqual(on)
    expect(withHyperCaps(on, false)).toEqual(DEFAULT_RULES)
  })
  test('the rule matches what the engine reads and is sent as-is to the service', () => {
    expect(HYPER_CAPS_RULE).toMatchObject({ type: 'homerow_mod', fromKey: 'caps_lock', tapKey: 'escape', modKey: 'hyper' })
    expect(createNativeProfile('t', withHyperCaps([], true)).rules[0]).toEqual(HYPER_CAPS_RULE)
  })
  test('the keyboard preview shows Escape on tap and the four Hyper symbols on hold', () => {
    const caps = MACBOOK_LAYOUT.find(k => k.code === 'caps_lock')!
    expect(macKeyFace([HYPER_CAPS_RULE], caps, null)).toMatchObject({ label: 'ESC', sub: 'hold ⌃⌥⇧⌘', kind: 'homerow' })
  })
})
