import { describe, expect, test } from 'bun:test'
import type { Rule } from '../src/lib/karabinerGenerator'
import { DEFAULT_RULES } from '../src/lib/macDefaults'
import { createKarabinerStore } from '../src/stores/karabinerStore'
import {
  KEY_TEMPLATES, addTemplate, addTemplateRules, cardTag, removeTemplate, removeTemplateRules, ruleSlot, sameRule, templateById,
  templateIsLive, templateSections, templateStatus, type KeyTemplate,
} from '../src/lib/templates'

const T = (id: string): KeyTemplate => templateById(id)!
const ids = KEY_TEMPLATES.map(t => t.id)
const statusOf = (id: string, rules: Rule[]) => templateStatus(T(id), rules)
const memoryStorage = () => { let v: string | null = null; return { getItem: () => v, setItem: (_: string, n: string) => { v = n }, removeItem: () => { v = null } } }

describe('templateStatus on the default profile (first run)', () => {
  const expected: Record<string, { status: string; count?: number }> = {
    'combos-easy-reach': { status: 'in' },
    'home-row-starter': { status: 'clash', count: 8 },
    'home-row-gacs': { status: 'clash', count: 6 },
    'home-row-cags': { status: 'clash', count: 4 },
    'caps-esc-ctrl': { status: 'free' },
    'space-arrows': { status: 'free' },
    'number-pad-layer': { status: 'free' },
    'symbols-layer': { status: 'free' },
  }
  for (const [id, want] of Object.entries(expected)) {
    test(id, () => {
      const s = statusOf(id, DEFAULT_RULES)
      expect(s.status).toBe(want.status as never)
      if (want.count) { expect(s.replacedCount).toBe(want.count); expect(s.replacesOnlyStarting).toBe(true) }
    })
  }
  test('card tags read as designed', () => {
    expect(cardTag(statusOf('combos-easy-reach', DEFAULT_RULES))?.text).toBe('In your keys')
    expect(cardTag(statusOf('home-row-gacs', DEFAULT_RULES))?.text).toBe('Swaps 6 starting keys')
    const one = { ...statusOf('home-row-gacs', DEFAULT_RULES), replacedCount: 1 }
    expect(cardTag(one)?.text).toBe('Swaps 1 starting key')
    expect(cardTag({ ...one, replacesOnlyStarting: false })?.text).toBe('Replaces 1 of your rules')
    expect(cardTag(statusOf('space-arrows', DEFAULT_RULES))).toBeNull()
  })
  test('covers every template', () => expect(Object.keys(expected).sort()).toEqual([...ids].sort()))
})

describe('templateStatus: profile holds exactly one template', () => {
  const table: Record<string, Record<string, [string, number?]>> = {
    'caps-esc-ctrl': { 'number-pad-layer': ['clash', 1] },
    'number-pad-layer': { 'caps-esc-ctrl': ['clash', 1] },
    'home-row-starter': { 'home-row-gacs': ['clash', 2], 'home-row-cags': ['free'] },
    'home-row-gacs': { 'home-row-starter': ['clash', 6], 'home-row-cags': ['clash', 4] },
    'home-row-cags': { 'home-row-starter': ['clash', 4], 'home-row-gacs': ['clash', 4] },
  }
  for (const a of ids) for (const b of ids) {
    if (a === b) continue
    const [status, count] = table[a]?.[b] ?? ['free']
    test(`${a} present -> ${b} is ${status}${count ? ` (${count})` : ''}`, () => {
      const s = statusOf(b, T(a).rules)
      expect(s.status).toBe(status as never)
      if (count) expect(s.replacedCount).toBe(count)
    })
  }
  test('CAGS present: Starter adds nothing, so the result is exactly Starter', () => {
    expect(statusOf('home-row-starter', T('home-row-cags').rules).added).toEqual([])
    expect(addTemplateRules(T('home-row-starter'), T('home-row-cags').rules)).toEqual(T('home-row-cags').rules.filter(r => r.type === 'homerow_mod' && ['d', 'f', 'j', 'k'].includes(r.fromKey)))
  })
})

describe('apply, remove and idempotence', () => {
  const profiles: [string, Rule[]][] = [['empty', []], ['default', DEFAULT_RULES], ['caps', T('caps-esc-ctrl').rules], ['gacs', T('home-row-gacs').rules]]
  for (const id of ids) {
    test(`${id} alone is in for itself`, () => expect(statusOf(id, T(id).rules).status).toBe('in'))
    for (const [name, base] of profiles) {
      test(`${id} onto ${name}: ends in, no duplicate rule, one rule per slot`, () => {
        const next = addTemplateRules(T(id), base)
        expect(statusOf(id, next).status).toBe('in')
        expect(addTemplateRules(T(id), next)).toEqual(next)
        const own = new Set(T(id).rules.map(ruleSlot))
        for (const slot of own) expect(next.filter(r => ruleSlot(r) === slot).length).toBe(1)
        for (const [i, r] of next.entries()) expect(next.findIndex(o => sameRule(o, r))).toBe(i)
      })
    }
    test(`${id}: on a profile with none of its slots the result is rules + template.rules`, () => {
      expect(addTemplateRules(T(id), [])).toEqual(T(id).rules)
    })
    test(`${id}: Add then Remove restores a profile that did not have it`, () => {
      const base: Rule[] = [{ type: 'simple', description: 'x', fromKey: 'z', toKey: 'x' }]
      expect(removeTemplateRules(T(id), addTemplateRules(T(id), base))).toEqual(base)
    })
  }
  test('Remove takes out exactly the template rules and nothing else', () => {
    const rules = [...DEFAULT_RULES, ...T('space-arrows').rules]
    expect(removeTemplateRules(T('space-arrows'), rules)).toEqual(DEFAULT_RULES)
  })
  test('a home-row mod and a combo on one key never clash (the default profile has both on K)', () => {
    const combo = T('combos-easy-reach').rules[0]
    const mod = T('home-row-gacs').rules.find(r => r.type === 'homerow_mod' && r.fromKey === 'k')!
    expect(ruleSlot(combo)).not.toBe(ruleSlot(mod))
    expect(statusOf('combos-easy-reach', [mod]).replacedCount).toBe(0)
    expect(statusOf('home-row-gacs', [combo]).replacedCount).toBe(0)
  })
  test('the same layer name with different content is a clash and the layer is replaced whole', () => {
    const old: Rule[] = [
      { type: 'layer_activator', description: 'old', fromKey: 'tab', layerName: 'arrows' },
      { type: 'layer_binding', description: 'old', layerName: 'arrows', fromKey: 'a', toKey: 'left_arrow' },
    ]
    const s = statusOf('space-arrows', old)
    expect(s.status).toBe('clash')
    expect(s.replacedCount).toBe(2)
    expect(addTemplateRules(T('space-arrows'), old)).toEqual(T('space-arrows').rules)
  })
  test('no rule belongs to two templates that can be in together', () => {
    for (const a of ids) for (const b of ids) {
      if (a >= b) continue
      const shared = T(a).rules.some(r => T(b).rules.some(o => sameRule(r, o)))
      if (shared) {
        expect(statusOf(b, addTemplateRules(T(a), [])).status).not.toBe('in')
        expect(statusOf(a, addTemplateRules(T(b), [])).status).not.toBe('in')
      }
    }
  })
  test('description never decides whether rules are the same; combo keys compare as a set', () => {
    const [kl] = T('combos-easy-reach').rules
    if (kl.type !== 'combo') throw new Error('expected combo')
    expect(sameRule(kl, { ...kl, description: 'other', fromKeys: [...kl.fromKeys].reverse() })).toBe(true)
  })
})

describe('store: one history entry per Add or Remove', () => {
  for (const id of ids) {
    test(`${id}: Add is one undo step and never calls addLayer; Remove likewise`, () => {
      const store = createKarabinerStore(memoryStorage())
      let layerCalls = 0
      store.setState({ addLayer: () => { layerCalls++; return null } })
      const before = store.getState().rules
      const past = store.getState().past.length
      addTemplate(store.getState(), T(id))
      if (statusOf(id, before).status === 'in') {
        expect(store.getState().past.length).toBe(past)
      } else {
        expect(store.getState().past.length).toBe(past + 1)
        store.getState().undo()
        expect(store.getState().rules).toEqual(before)
        store.getState().redo()
      }
      const mid = store.getState().rules
      const p2 = store.getState().past.length
      removeTemplate(store.getState(), T(id))
      expect(store.getState().past.length).toBe(p2 + 1)
      store.getState().undo()
      expect(store.getState().rules).toEqual(mid)
      expect(layerCalls).toBe(0)
    })
  }
})

describe('Try it and gallery order', () => {
  test('live only when the rules are in the draft and in what remapping last applied, and it is running', () => {
    const t = T('space-arrows')
    expect(templateIsLive(t, t.rules, t.rules, true)).toBe(true)
    expect(templateIsLive(t, t.rules, t.rules, false)).toBe(false)
    expect(templateIsLive(t, t.rules, DEFAULT_RULES, true)).toBe(false)
    expect(templateIsLive(t, DEFAULT_RULES, t.rules, true)).toBe(false)
    expect(templateIsLive(t, t.rules, null, true)).toBe(true) // after a relaunch nothing is recorded as applied
    expect(templateIsLive(t, DEFAULT_RULES, null, true)).toBe(false)
  })
  test('sections are in the designed order, easy first, catalog order on ties', () => {
    const sections = templateSections(KEY_TEMPLATES)
    expect(sections.map(s => s.category)).toEqual(['caps', 'home-row', 'layers', 'combos'])
    expect(sections[1].items.map(t => t.id)).toEqual(['home-row-starter', 'home-row-gacs', 'home-row-cags'])
    expect(templateSections([T('caps-esc-ctrl')]).map(s => s.title)).toEqual(['Caps Lock'])
  })
})
