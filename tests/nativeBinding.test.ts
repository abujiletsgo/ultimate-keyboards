import { test, expect } from 'bun:test'
import { applyNativeBinding, readNativeBinding, nativeBindingError } from '../src/lib/nativeBinding'
import { semanticKeyVisual, keyBehaviorVars, type KeyBehavior } from '../src/lib/keyVisual'
import type { Rule } from '../src/lib/karabinerGenerator'
const conditional: Rule = { type: 'simple', description: 'Ctrl J', fromKey: 'j', fromModifiers: ['control'], toKey: 'escape' }
const combo: Rule = { type: 'combo', description: 'JK', fromKeys: ['j', 'k'], toKey: 'escape' }
const base = { type: 'simple', description: 'J B', fromKey: 'j', toKey: 'b', toModifiers: ['right_command'], custom: { keep: true } } as const
const layer: Rule = { type: 'layer_binding', description: 'Nav J', fromKey: 'j', layerName: 'nav', toKey: 'down_arrow' }
const rules = [conditional, combo, structuredClone(base), layer] as Rule[]
test('native editing targets first unconditional Base rule, retaining position, modifiers, unknown metadata and untouched conditional/combo', () => {
  const draft = readNativeBinding(rules, 'j', null)
  expect(draft.modifiers).toEqual(['right_command'])
  const changed = applyNativeBinding(rules, 'j', null, { ...draft, key: 'c' })
  expect(changed).toEqual([conditional, combo, { ...base, toKey: 'c' }, layer])
  expect(rules[2]).toEqual(base)
})
test('native variant changes remove obsolete known fields while retaining metadata and global order', () => {
  let changed = applyNativeBinding(rules, 'j', null, { ...readNativeBinding(rules, 'j', null), behavior: 'lt', layer: 'nav', key: 'spacebar', holdBehavior: 'hold_preferred' })
  expect(changed[2]).toEqual({ type: 'layer_activator', description: base.description, fromKey: 'j', layerName: 'nav', tapKey: 'spacebar', holdBehavior: 'hold_preferred', custom: base.custom })
  changed = applyNativeBinding(changed, 'j', null, { ...readNativeBinding(changed, 'j', null), behavior: 'mo' })
  expect(changed[2]).not.toHaveProperty('tapKey'); expect(changed[2]).not.toHaveProperty('holdBehavior')
  changed = applyNativeBinding(changed, 'j', null, { ...readNativeBinding(changed, 'j', null), behavior: 'mt', modifier: 'left_shift' })
  expect(changed[2]).not.toHaveProperty('layerName'); expect(changed[2]).toHaveProperty('modKey', 'left_shift')
  expect(changed[0]).toBe(conditional); expect(changed[1]).toBe(combo); expect(changed[3]).toBe(layer)
})
test('Pass-thru clears all direct Base variants and duplicates, retaining conditional, combo and layer rules', () => {
  const duplicates: Rule[] = [...rules, { ...base } as Rule, { type: 'layer_activator', description: '', fromKey: 'j', layerName: 'nav' }, { type: 'homerow_mod', description: '', fromKey: 'j', tapKey: 'j', modKey: 'left_shift' }]
  expect(applyNativeBinding(duplicates, 'j', null, { ...readNativeBinding(duplicates, 'j', null), behavior: 'trans' })).toEqual([conditional, combo, layer])
  const layered = [...duplicates, { ...layer }, { ...layer, layerName: 'other' }]
  expect(applyNativeBinding(layered, 'j', 'nav', { ...readNativeBinding(layered, 'j', 'nav'), behavior: 'trans' })).toEqual(layered.filter(rule => rule.type !== 'layer_binding' || rule.layerName !== 'nav'))
})
test('layer edits preserve first global slot and metadata, cannot encode unsupported behavior, and never modify input', () => {
  const input = [...rules, { ...layer, toKey: 'up_arrow' }]
  const copy = structuredClone(input)
  expect(applyNativeBinding(input, 'j', 'nav', { ...readNativeBinding(input, 'j', 'nav'), key: 'home' })[3]).toEqual({ ...layer, toKey: 'home' })
  expect(() => applyNativeBinding(input, 'j', 'nav', { ...readNativeBinding(input, 'j', 'nav'), behavior: 'mo' })).toThrow('supports Key and Pass-thru')
  expect(input).toEqual(copy)
})
test('new native policies default Balanced; unsupported key/actions cannot be silently saved', () => {
  expect(readNativeBinding([{ type: 'layer_activator', description: '', fromKey: 'j', layerName: 'nav', tapKey: 'j' }], 'j', null).holdBehavior).toBe('balanced')
  expect(nativeBindingError(readNativeBinding([], 'fn', null), 'fn', null)).toContain('pass-through only')
  const imported = [{ type: 'unknown_action', fromKey: 'j' }] as unknown as Rule[]
  expect(() => applyNativeBinding(imported, 'j', null, readNativeBinding([], 'j', null))).toThrow('unsupported imported action')
})
test('shared behavior visual is exact for Split and Mac; short keys can omit the secondary line', () => {
  expect(semanticKeyVisual('mod-tap', 'A', 'hold CTL')).toMatchObject({ label: 'A', sub: 'hold CTL', border: '#f2a35e', accent: '#f2a35e', fontSize: 10 })
  expect(semanticKeyVisual('normal', 'ESC')).toMatchObject({ fontSize: 11 })
})

test('shared palette: dark caps, each role its own rim colour (website look, 2026-11-14)', () => {
  // A role shows as rim + sub-label colour, never as a tinted fill (layers keep a faint blue cap so held layers read).
  const roles: KeyBehavior[] = ['layer-tap', 'toggle', 'mod-tap', 'combo', 'shifted', 'sticky', 'bluetooth', 'mouse', 'caps']
  for (const r of roles) { const v = keyBehaviorVars(r); expect(v.bg).toBeUndefined(); expect(v.border).toBe(v.accent) }
  expect(new Set(roles.map(r => keyBehaviorVars(r).accent)).size).toBe(roles.length)
  expect(keyBehaviorVars('mod-tap').accent).toBe('#f2a35e')
  expect(keyBehaviorVars('layer').accent).toBe('#5fc8ec')
  expect(keyBehaviorVars('trans')).toMatchObject({ dashed: true })
  expect(keyBehaviorVars('none')).toMatchObject({ dashed: true })
  expect(keyBehaviorVars('normal')).toEqual({})
})
