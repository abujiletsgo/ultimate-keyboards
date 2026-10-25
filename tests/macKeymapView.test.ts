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
    expect(macKeyFace(rules, key('a'), 'nav')).toMatchObject({ label: '···', sub: 'pass', kind: 'fallback', ruleIndex: -1 })
    expect(macKeyFace([], key('spacebar'), null)).toMatchObject({ label: 'SPC', kind: 'normal' })
    expect(macKeyFace([activator], key('spacebar'), null)).toMatchObject({ label: 'SPC', sub: 'hold nav', kind: 'layer-tap' })
  })
  test('earlier unconditional Base rules flag a configured layer binding; preview never reorders to hide conflict', () => {
    for (const base of [
      { type: 'simple', description: 'H to J', fromKey: 'h', toKey: 'j' },
      { type: 'homerow_mod', description: 'H control', fromKey: 'h', tapKey: 'h', modKey: 'left_control' },
      { ...activator, fromKey: 'h' },
    ] as Rule[]) {
      const rules = [base, binding]
      const before = structuredClone(rules)
      expect(macKeyFace(rules, key('h'), 'nav')).toMatchObject({ label: '←', kind: 'conflict', shadowedBy: 0, ruleIndex: 1 })
      expect(macKeyFace([binding, base], key('h'), 'nav').shadowedBy).toBeUndefined()
      expect(rules).toEqual(before)
    }
  })
  test('modifier and combo conditions are disclosed without claiming unconditional runtime output', () => {
    const rules: Rule[] = [
      { type: 'simple', description: 'Control H', fromKey: 'h', fromModifiers: ['control'], toKey: 'delete_or_backspace' }, binding,
      { type: 'combo', description: 'HK Escape', fromKeys: ['h', 'k'], toKey: 'escape' },
    ]
    expect(macKeyFace(rules, key('h'), null)).toMatchObject({ label: 'H', conditional: true, ruleIndex: -1 })
    expect(macKeyFace(rules, key('h'), 'nav')).toMatchObject({ kind: 'remap', conditional: true })
    expect(macKeyFace(rules, key('h'), 'nav').detail).toContain('configured preview')
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
