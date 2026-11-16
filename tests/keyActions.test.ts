import { describe, expect, test } from 'bun:test'
import { HOMEROW_MISFIRE_DEFAULTS, type Rule } from '../src/lib/karabinerGenerator'
import { HYPER_CAPS_RULE } from '../src/lib/macDefaults'
import {
  addCombo, clearLayerTap, holdChoices, holdModifierFor, pickOutput, readKeyActions, removeCombo, setComboOutput, setKeyHold, setKeyTap, toggleModifier,
} from '../src/lib/keyActions'

const base = (rules: readonly Rule[], code: string) => rules.filter(r => 'fromKey' in r && r.fromKey === code && r.type !== 'layer_binding' && !(r.type === 'simple' && r.fromModifiers?.length))
const homerow = (modKey: string, extra = {}): Rule => ({ type: 'homerow_mod', description: 'k', fromKey: 'k', tapKey: 'k', modKey, ...extra })

describe('Tap', () => {
  test('a key with no rule is itself; changing Tap writes one simple rule, and setting it back removes it', () => {
    expect(readKeyActions([], 'k', null)).toEqual({ tap: { key: 'k', modifiers: [], custom: false }, hold: { kind: 'none' }, combos: [] })
    const rules = setKeyTap([], 'k', null, { key: 'j', modifiers: [] })
    expect(rules).toMatchObject([{ type: 'simple', fromKey: 'k', toKey: 'j' }])
    expect(readKeyActions(rules, 'k', null).tap).toEqual({ key: 'j', modifiers: [], custom: true })
    expect(setKeyTap(rules, 'k', null, { key: 'k', modifiers: [] })).toEqual([])
  })
  test('modifiers go with Tap only while Hold is None', () => {
    const shortcut = setKeyTap([], 'k', null, { key: 'c', modifiers: ['command'] })
    expect(readKeyActions(shortcut, 'k', null).tap).toEqual({ key: 'c', modifiers: ['command'], custom: true })
    const held = setKeyHold(shortcut, 'k', { kind: 'modifier', modifier: 'left_control' })
    expect(held).toMatchObject([{ type: 'homerow_mod', tapKey: 'c', modKey: 'left_control' }])
    expect(readKeyActions(held, 'k', null).tap.modifiers).toEqual([])
    expect(setKeyTap(held, 'k', null, { key: 'c', modifiers: ['shift'] })).toMatchObject([{ type: 'homerow_mod', tapKey: 'c' }])
  })
  test('shifted symbols pick Shift for you, and toggling a modifier adds and removes it', () => {
    expect(pickOutput({ key: 'k', modifiers: [] }, 'k')).toEqual({ key: 'k', modifiers: [] })
    expect(toggleModifier(['shift'], 'command')).toEqual(['shift', 'command'])
    expect(toggleModifier(['shift'], 'shift')).toEqual([])
  })
})

describe('Hold', () => {
  test('a new modifier hold gets the misfire-safe defaults; switching modifier keeps the key’s own timing', () => {
    const first = setKeyHold([], 'k', { kind: 'modifier', modifier: 'right_control' })
    expect(first).toMatchObject([{ type: 'homerow_mod', fromKey: 'k', tapKey: 'k', modKey: 'right_control', ...HOMEROW_MISFIRE_DEFAULTS }])
    const tuned = [homerow('right_control', { holdThresholdMs: 300, holdBehavior: 'balanced' })]
    const next = setKeyHold(tuned, 'k', { kind: 'modifier', modifier: 'right_shift' })
    expect(next).toMatchObject([{ modKey: 'right_shift', holdThresholdMs: 300, holdBehavior: 'balanced' }])
    expect(readKeyActions(next, 'k', null).hold).toEqual({ kind: 'modifier', modifier: 'right_shift' })
  })
  test('switching converts simple <-> homerow_mod <-> layer_activator and never leaves two base rules', () => {
    let rules: Rule[] = setKeyTap([], 'k', null, { key: 'j', modifiers: [] })
    rules = setKeyHold(rules, 'k', { kind: 'modifier', modifier: 'right_command' })
    expect(base(rules, 'k')).toMatchObject([{ type: 'homerow_mod', tapKey: 'j' }])
    rules = setKeyHold(rules, 'k', { kind: 'layer', layer: 'nav' })
    expect(base(rules, 'k')).toMatchObject([{ type: 'layer_activator', layerName: 'nav', tapKey: 'j', holdBehavior: 'balanced' }])
    rules = setKeyHold(rules, 'k', { kind: 'none' })
    expect(base(rules, 'k')).toMatchObject([{ type: 'simple', toKey: 'j' }])
    rules = setKeyTap(setKeyHold(rules, 'k', { kind: 'none' }), 'k', null, { key: 'k', modifiers: [] })
    expect(base(rules, 'k')).toEqual([])
  })
  test('an imported profile with two base rules for a key ends with one', () => {
    const two: Rule[] = [{ type: 'simple', description: 'a', fromKey: 'k', toKey: 'j' }, homerow('right_shift')]
    expect(base(setKeyHold(two, 'k', { kind: 'modifier', modifier: 'right_option' }), 'k')).toHaveLength(1)
  })
  test('Hyper round-trips and shows as a choice only for Caps Lock or when already set', () => {
    const caps = [HYPER_CAPS_RULE]
    expect(readKeyActions(caps, 'caps_lock', null)).toMatchObject({ tap: { key: 'escape' }, hold: { kind: 'modifier', modifier: 'hyper' } })
    expect(setKeyTap(caps, 'caps_lock', null, { key: 'tab', modifiers: [] })).toMatchObject([{ modKey: 'hyper', tapKey: 'tab' }])
    expect(holdChoices('caps_lock', { kind: 'none' })).toContain('hyper')
    expect(holdChoices('k', { kind: 'none' })).not.toContain('hyper')
    expect(holdChoices('k', { kind: 'modifier', modifier: 'hyper' })).toContain('hyper')
    expect(setKeyHold([], 'caps_lock', { kind: 'modifier', modifier: holdModifierFor('caps_lock', 'hyper') })).toMatchObject([{ modKey: 'hyper' }])
  })
  test('a chip uses the hand the key is on and keeps an existing side', () => {
    expect(holdModifierFor('f', 'control')).toBe('left_control')
    expect(holdModifierFor('j', 'control')).toBe('right_control')
    expect(holdModifierFor('j', 'control', 'left_control')).toBe('left_control')
    expect(holdModifierFor('j', 'shift', 'left_control')).toBe('right_shift')
  })
})

describe('Combos', () => {
  test('lists, adds, edits and removes the combos that contain the key', () => {
    let rules = addCombo([], 'k', 'l', 'return_or_enter')
    rules = addCombo(rules, 'i', 'o', 'delete_or_backspace')
    expect(readKeyActions(rules, 'k', null).combos).toEqual([{ index: 0, keys: ['k', 'l'], partners: ['l'], toKey: 'return_or_enter', toModifiers: [] }])
    expect(readKeyActions(rules, 'l', null).combos).toHaveLength(1)
    rules = setComboOutput(rules, 0, 'c', ['command'])
    expect(rules[0]).toMatchObject({ type: 'combo', fromKeys: ['k', 'l'], toKey: 'c', toModifiers: ['command'] })
    expect(setComboOutput(rules, 0, 'escape', [])[0]).not.toHaveProperty('toModifiers')
    rules = removeCombo(rules, 0)
    expect(readKeyActions(rules, 'k', null).combos).toEqual([])
    expect(rules).toHaveLength(1)
  })
  test('rejects the same key, a repeated pair and an unsupported key; never mutates', () => {
    const rules = addCombo([], 'k', 'l', 'escape')
    const before = structuredClone(rules)
    expect(() => addCombo(rules, 'k', 'k', 'escape')).toThrow()
    expect(() => addCombo(rules, 'l', 'k', 'tab')).toThrow('already')
    expect(() => addCombo(rules, 'k', 'fn', 'tab')).toThrow()
    expect(() => addCombo(rules, 'k', 'j', 'nonsense')).toThrow()
    expect(rules).toEqual(before)
  })
  test('combos and a hold live together in any order (the engine gives a combo first chance)', () => {
    const rules = addCombo([homerow('right_control')], 'k', 'l', 'return_or_enter')
    expect(readKeyActions(rules, 'k', null)).toMatchObject({ hold: { kind: 'modifier' }, combos: [{ toKey: 'return_or_enter' }] })
    expect(setKeyHold(rules, 'k', { kind: 'none' }).filter(r => r.type === 'combo')).toHaveLength(1)
  })
})

describe('Layers', () => {
  const binding: Rule = { type: 'layer_binding', description: 'n', fromKey: 'k', layerName: 'nav', toKey: 'up_arrow' }
  test('only Tap exists on a layer; it reads and writes a layer binding and can fall back to Base', () => {
    expect(readKeyActions([binding, addCombo([], 'k', 'l', 'tab')[0]], 'k', 'nav')).toEqual({ tap: { key: 'up_arrow', modifiers: [], custom: true }, hold: { kind: 'none' }, combos: [] })
    expect(readKeyActions([], 'k', 'nav').tap.custom).toBe(false)
    const set = setKeyTap([], 'k', 'nav', { key: 'down_arrow', modifiers: ['option'] })
    expect(set).toMatchObject([{ type: 'layer_binding', layerName: 'nav', fromKey: 'k', toKey: 'down_arrow', toModifiers: ['option'] }])
    expect(clearLayerTap(set, 'k', 'nav')).toEqual([])
  })
})
