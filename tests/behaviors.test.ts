import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseBehaviors, setBehaviorProp, addBehavior, removeBehavior, splitCells, joinCells, intValue, stringValue } from '../src/lib/dt/behaviors'
import { parseKeymapText } from '../src/lib/zmkParser'

const fx = (n: string) => readFileSync(join(import.meta.dir, n), 'utf8')
const corne = fx('fixtures/corne_tp.keymap')
const glove = fx('corpus/glove80.keymap')

describe('behaviors: parse', () => {
  test('corne_tp: six mod-morphs (and a non-zmk node ignored)', () => {
    const d = parseBehaviors(corne)
    const kinds = d.behaviors.map(b => b.kind)
    expect(kinds.filter(k => k === 'mod-morph').length).toBe(6)
    expect(d.behaviors.find(b => b.label === 'tri_layer')).toBeUndefined() // urob compatible, not zmk,behavior-*
    const bs = d.behaviors.find(b => b.label === 'and_bspc')!
    expect(bs.compatible).toBe('zmk,behavior-mod-morph')
    expect(bs.bindingCells).toBe(0)
    expect(splitCells(bs.props.find(p => p.name === 'bindings')!.value)).toEqual(['&kp BACKSPACE', '&kp LA(BACKSPACE)'])
    expect(bs.props.find(p => p.name === 'mods')!.value).toBe('<(MOD_RCTL)>')
    expect(d.behaviorsClose).not.toBeNull()
    expect(d.macrosClose).toBeNull()
  })

  test('glove80: tap-dance, hold-tap and macros with sections', () => {
    const d = parseBehaviors(glove)
    expect(d.behaviors.find(b => b.label === 'layer_td')?.kind).toBe('tap-dance')
    expect(intValue(d.behaviors.find(b => b.label === 'layer_td')!.props.find(p => p.name === 'tapping-term-ms'))).toBe(200)
    const magic = d.behaviors.find(b => b.label === 'magic')!
    expect(magic.kind).toBe('hold-tap')
    expect(stringValue(magic.props.find(p => p.name === 'flavor'))).toBeDefined()
    const macros = d.behaviors.filter(b => b.section === 'macros')
    expect(macros.length).toBeGreaterThanOrEqual(5)
    expect(splitCells(macros.find(b => b.label === 'bt_0')!.props.find(p => p.name === 'bindings')!.value)).toEqual(['&out OUT_BLE', '&bt BT_SEL 0'])
  })
})

describe('behaviors: edits are byte-exact', () => {
  test('replace, add and remove a property; the keymap is untouched', () => {
    const before = parseKeymapText(corne)
    let s = setBehaviorProp(corne, 'and_bspc', 'mods', '<(MOD_RCTL|MOD_LCTL)>')
    expect(parseBehaviors(s).behaviors.find(b => b.label === 'and_bspc')!.props.find(p => p.name === 'mods')!.value).toBe('<(MOD_RCTL|MOD_LCTL)>')
    s = setBehaviorProp(s, 'and_bspc', 'keep-mods', '<(MOD_LSFT)>')
    expect(parseBehaviors(s).behaviors.find(b => b.label === 'and_bspc')!.props.some(p => p.name === 'keep-mods')).toBe(true)
    s = setBehaviorProp(s, 'and_bspc', 'keep-mods', null)
    s = setBehaviorProp(s, 'and_bspc', 'mods', '<(MOD_RCTL)>')
    expect(s).toBe(corne)
    expect(parseKeymapText(s).layers).toEqual(before.layers)
  })

  test('flags: add a flag property and remove it', () => {
    let s = setBehaviorProp(glove, 'magic', 'hold-trigger-on-release', '')
    expect(/hold-trigger-on-release;/.test(s)).toBe(true)
    s = setBehaviorProp(s, 'magic', 'hold-trigger-on-release', null)
    expect(s).toBe(glove)
  })

  test('add a hold-tap, then remove it → original bytes', () => {
    const s = addBehavior(corne, {
      label: 'hml', name: 'homerow_mods_left', compatible: 'zmk,behavior-hold-tap',
      props: [
        { name: '#binding-cells', value: '<2>' },
        { name: 'bindings', value: joinCells(['&kp', '&kp']) },
        { name: 'flavor', value: '"balanced"' },
        { name: 'tapping-term-ms', value: '<280>' },
        { name: 'hold-trigger-on-release', value: '' },
      ],
    })
    const d = parseBehaviors(s)
    const h = d.behaviors.find(b => b.label === 'hml')!
    expect(h.kind).toBe('hold-tap')
    expect(h.bindingCells).toBe(2)
    expect(h.props.find(p => p.name === 'hold-trigger-on-release')!.value).toBe('')
    expect(parseKeymapText(s).layers).toEqual(parseKeymapText(corne).layers)
    expect(removeBehavior(s, 'hml')).toBe(corne)
  })

  test('a macro goes into a new macros section when none exists', () => {
    const s = addBehavior(corne, { label: 'hello', compatible: 'zmk,behavior-macro', props: [{ name: '#binding-cells', value: '<0>' }, { name: 'bindings', value: joinCells(['&kp H', '&kp I']) }] })
    const d = parseBehaviors(s)
    expect(d.macrosClose).not.toBeNull()
    expect(d.behaviors.find(b => b.label === 'hello')!.section).toBe('macros')
    expect(parseKeymapText(s).syntaxErrors).toEqual([])
    expect(removeBehavior(s, 'hello')).not.toBe(corne) // the empty macros {} section stays; that's fine
    expect(parseKeymapText(removeBehavior(s, 'hello')).layers).toEqual(parseKeymapText(corne).layers)
  })

  test('duplicate label is refused', () => {
    expect(() => addBehavior(corne, { label: 'and_bspc', compatible: 'zmk,behavior-mod-morph', props: [] })).toThrow()
  })
})
