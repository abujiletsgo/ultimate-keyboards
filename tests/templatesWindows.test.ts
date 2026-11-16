import { describe, expect, test } from 'bun:test'
import type { Rule } from '../src/lib/karabinerGenerator'
import { BLURB_MAX, SHORT_NAME_MAX, TEMPLATE_CATALOG, isCatalogLink, ruleIdentity, rolesFromRules, templatesFor, type KeyTemplate } from '../src/lib/templates'
import { modifierName } from '../src/lib/platform'

const mac = templatesFor('mac')
const win = templatesFor('windows')
const byId = (list: readonly KeyTemplate[], id: string) => list.find(t => t.id === id)!
/** fromKey -> modKey for a template's hold-for-modifier rules. */
const holds = (t: KeyTemplate) => Object.fromEntries(t.rules.flatMap(r => (r.type === 'homerow_mod' ? [[r.fromKey, r.modKey]] : [])))
const copyOf = (t: KeyTemplate) => [t.name, t.shortName, t.blurb, t.why, t.forWho, ...t.changes, t.caution ?? '', t.video.note, t.source.title, t.source.note, ...t.rules.map(r => r.description)]

describe('Windows templates', () => {
  test('Mac templates are the catalog, unchanged', () => {
    expect(mac).toBe(TEMPLATE_CATALOG.templates)
    expect(byId(mac, 'home-row-starter').rules.find(r => r.type === 'homerow_mod' && r.fromKey === 'd')).toMatchObject({ modKey: 'left_command' })
  })

  test('same templates, same order, same keys', () => {
    expect(win.map(t => t.id)).toEqual(mac.map(t => t.id))
    for (const [i, t] of win.entries()) expect(t.rules.map(r => r.type)).toEqual(mac[i].rules.map(r => r.type))
  })

  test('home row starter holds Ctrl or Shift', () => {
    expect(holds(byId(win, 'home-row-starter'))).toEqual({ d: 'left_control', f: 'left_shift', j: 'right_shift', k: 'right_control' })
  })

  test('CAGS puts Ctrl on the strong middle finger, Win on the pinky', () => {
    expect(holds(byId(win, 'home-row-cags'))).toMatchObject({ a: 'left_command', d: 'left_control', k: 'right_control', semicolon: 'right_command' })
  })

  test('GACS swaps the same way, so Ctrl lands on the pinky and the two sets stay different', () => {
    expect(holds(byId(win, 'home-row-gacs'))).toMatchObject({ a: 'left_control', d: 'left_command', k: 'right_command', semicolon: 'right_control' })
    const ids = new Set(win.map(t => JSON.stringify(t.rules.map(ruleIdentity))))
    expect(ids.size).toBe(win.length)
  })

  test('Caps Lock stays Escape and Ctrl', () => {
    expect(holds(byId(win, 'caps-esc-ctrl'))).toEqual({ caps_lock: 'left_control' })
    expect(byId(win, 'caps-esc-ctrl').name).toBe('Caps Lock: Escape and Ctrl')
  })

  test('symbols layer is on Right Alt and warns about AltGr', () => {
    const t = byId(win, 'symbols-layer')
    expect(t.rules[0]).toMatchObject({ type: 'layer_activator', fromKey: 'right_option', description: 'Right Alt: hold turns on symbols' })
    expect(t.blurb).toContain('Right Alt')
    expect(t.caution).toContain('AltGr')
  })

  test('no Mac words in any Windows copy, and the copy says what the rules do', () => {
    for (const t of win) {
      for (const text of copyOf(t)) expect({ id: t.id, text, mac: /\b(Command|Option|Mac|macOS)\b|[⌘⌥⌃]|Mac habits/.test(text) }).toEqual({ id: t.id, text, mac: false })
      for (const r of t.rules as Rule[]) if (r.type === 'homerow_mod') expect(r.description).toEndWith(`hold is ${modifierName(r.modKey, 'windows')}`)
      const named = new Set(t.changes.join(' ').match(/\b(Win|Alt|Ctrl)\b/g) ?? [])
      for (const r of t.rules) if (r.type === 'homerow_mod' && !r.modKey.endsWith('shift')) expect(named.has(modifierName(r.modKey, 'windows'))).toBe(true)
    }
  })

  test('cards fit, links stay in the catalog, previews draw Windows names', () => {
    for (const t of win) {
      expect(t.shortName.length).toBeLessThanOrEqual(SHORT_NAME_MAX)
      expect(t.blurb.length).toBeLessThanOrEqual(BLURB_MAX)
      expect(isCatalogLink(t.video.url) && isCatalogLink(t.source.url)).toBe(true)
    }
    const marks = rolesFromRules(byId(win, 'home-row-starter').rules)
    expect(modifierName((byId(win, 'home-row-starter').rules[0] as { modKey: string }).modKey, 'windows')).toBe('Ctrl')
    expect(marks.get('d')?.role).toBe('modtap')
  })

  test('building the Windows set does not touch the catalog', () => {
    templatesFor('windows')
    expect(holds(byId(mac, 'home-row-cags')).d).toBe('left_command')
  })
})
