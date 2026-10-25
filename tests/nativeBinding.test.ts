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
  expect(semanticKeyVisual('mod-tap', 'A', 'hold CTL')).toMatchObject({ label: 'A', sub: 'hold CTL', text: '#fdba74', fontSize: 10 })
  expect(semanticKeyVisual('normal', 'ESC')).toMatchObject({ fontSize: 11 })
})

test('shared palette retains all existing QMK colors, including its distinct shifted green', () => {
  const palette: [KeyBehavior, string | undefined, string | undefined, string | undefined, boolean?][] = [
    ['trans', 'rgba(255,255,255,0.025)', 'rgba(255,255,255,0.10)', 'rgba(226,230,255,0.25)', true],
    ['none', 'rgba(251,113,133,0.05)', 'rgba(251,113,133,0.16)', 'rgba(251,113,133,0.40)', true],
    ['layer', 'linear-gradient(180deg, rgba(96,165,250,0.30), rgba(96,165,250,0.16))', 'rgba(96,165,250,0.50)', '#bfdbfe'],
    ['toggle', 'linear-gradient(180deg, rgba(245,158,11,0.26), rgba(245,158,11,0.13))', 'rgba(245,158,11,0.45)', '#fcd34d'],
    ['layer-tap', 'linear-gradient(180deg, rgba(96,165,250,0.18), rgba(96,165,250,0.08))', 'rgba(96,165,250,0.35)', '#93c5fd'],
    ['mod-tap', 'linear-gradient(180deg, rgba(251,146,60,0.20), rgba(251,146,60,0.09))', 'rgba(251,146,60,0.40)', '#fdba74'],
    ['shifted', 'linear-gradient(180deg, rgba(52,211,153,0.20), rgba(52,211,153,0.09))', 'rgba(52,211,153,0.40)', '#6ee7b7'],
  ]
  for (const [behavior, bg, border, text, dashed] of palette) {
    expect(keyBehaviorVars(behavior)).toEqual({ bg, border, text, ...(dashed ? { dashed } : {}) })
  }
  expect(keyBehaviorVars('normal')).toEqual({})
})
