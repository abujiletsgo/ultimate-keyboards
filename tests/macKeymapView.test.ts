import { describe, expect, test } from 'bun:test'
import { MACBOOK_LAYOUT } from '../src/lib/macbookLayout'
import { macLayers, macKeyFace, validMacLayer, macUnplacedKeys, MAC_PHYSICAL_LAYOUT } from '../src/lib/macKeymapView'
import { applyNativeBinding, readNativeBinding } from '../src/lib/nativeBinding'
import type { Rule, LayerBindingRule } from '../src/lib/karabinerGenerator'

const key = (code: string) => MACBOOK_LAYOUT.find(key => key.code === code)!
const binding: LayerBindingRule = { type: 'layer_binding', description: 'Nav H', fromKey: 'h', layerName: 'nav', toKey: 'left_arrow' }
const activator: Rule = { type: 'layer_activator', description: 'Space nav', fromKey: 'spacebar', layerName: 'nav', tapKey: 'spacebar', holdBehavior: 'balanced' }

describe('Mac Keymap configured preview', () => {
  test('derives actual layers in first-seen order, including binding-only layers; Base is distinct from a layer named Base', () => {
    expect(macLayers([binding, activator, { ...binding, layerName: 'Base' }])).toEqual([
      { name: null, activators: [], bindings: 0 }, { name: 'nav', activators: ['spacebar'], bindings: 1 }, { name: 'Base', activators: [], bindings: 1 },
    ])
    expect(validMacLayer([binding], 'nav')).toBe('nav')
    expect(validMacLayer([], 'nav')).toBeNull()
  })
  test('layer faces show configured output, physical origin and inherited Base separately', () => {
    const rules: Rule[] = [binding, { type: 'simple', description: 'A to B', fromKey: 'a', toKey: 'b' }]
    expect(macKeyFace(rules, key('h'), 'nav')).toMatchObject({ label: '←', sub: '', kind: 'remap', ruleIndex: 0 })
    expect(macKeyFace(rules, key('a'), 'nav')).toMatchObject({ label: '···', sub: '', kind: 'fallback', ruleIndex: -1 })
    expect(macKeyFace([], key('spacebar'), null)).toMatchObject({ label: 'SPC', kind: 'normal' })
    expect(macKeyFace([activator], key('spacebar'), null)).toMatchObject({ label: 'SPC', sub: 'nav', kind: 'layer' })
  })
  test('a layer binding shows its own output whatever Base rules come first (the order never matters)', () => {
    for (const base of [
      { type: 'simple', description: 'H to J', fromKey: 'h', toKey: 'j' },
      { type: 'homerow_mod', description: 'H control', fromKey: 'h', tapKey: 'h', modKey: 'left_control' },
      { ...activator, fromKey: 'h' },
    ] as Rule[]) {
      const rules = [base, binding]
      const before = structuredClone(rules)
      expect(macKeyFace(rules, key('h'), 'nav')).toMatchObject({ label: '←', kind: 'remap', ruleIndex: 1 })
      expect(macKeyFace([binding, base], key('h'), 'nav')).toMatchObject({ label: '←', kind: 'remap', ruleIndex: 0 })
      expect(rules).toEqual(before)
    }
  })
  test('key face: tap is the big label, hold the small one, and a combo adds the ring flag', () => {
    const rules: Rule[] = [
      { type: 'homerow_mod', description: 'K control', fromKey: 'k', tapKey: 'k', modKey: 'right_control' },
      { type: 'combo', description: 'KL Enter', fromKeys: ['k', 'l'], toKey: 'return_or_enter' },
    ]
    expect(macKeyFace(rules, key('k'), null)).toMatchObject({ label: 'K', sub: '⌃', kind: 'homerow', combo: true })
    expect(macKeyFace(rules, key('l'), null)).toMatchObject({ label: 'L', sub: '', kind: 'normal', combo: true })
    expect(macKeyFace(rules, key('j'), null).combo).toBe(false)
    expect(macKeyFace(rules, key('k'), null).detail).toBe('K: types K, hold ⌃, in a combo')
    // Combos are Base-only, and a layer fallback shows nothing extra.
    expect(macKeyFace(rules, key('l'), 'nav')).toMatchObject({ kind: 'fallback', combo: false })
  })
  test('contextual edit retains first binding global index, additional fields, unrelated rules, and native policy', () => {
    const saved = { ...binding, editorMetadata: { note: 'keep' } }
    const rules: Rule[] = [activator, saved, { ...binding, toKey: 'right_arrow' }]
    const before = structuredClone(rules)
    const edit = applyNativeBinding(rules, 'h', 'nav', {
      ...readNativeBinding(rules, 'h', 'nav'), key: 'up_arrow', modifiers: ['option'],
    })
    expect(edit).toEqual([activator, { ...saved, toKey: 'up_arrow', toModifiers: ['option'] }, rules[2]])
    const added = applyNativeBinding(rules, 'j', 'nav', {
      ...readNativeBinding(rules, 'j', 'nav'), behavior: 'key', key: 'down_arrow',
    })
    expect(added.slice(0, rules.length)).toEqual(before)
    expect(added).toHaveLength(rules.length + 1)
    expect(added.at(-1)).toEqual({ type: 'layer_binding', description: 'j binding', fromKey: 'j', layerName: 'nav', toKey: 'down_arrow' })
    expect(rules).toEqual(before)
  })
  test('missing physical keys are retained as diagnostics; adapter keeps every Mac key coordinate and dimension', () => {
    expect(macUnplacedKeys([{ ...binding, fromKey: 'iso_section' }, binding, { ...binding, fromKey: 'iso_section' }])).toEqual(['iso_section'])
    expect(MAC_PHYSICAL_LAYOUT.keys).toEqual(MACBOOK_LAYOUT.map(({ x, y, w, h }) => ({ x, y, w, h })))
  })
})
