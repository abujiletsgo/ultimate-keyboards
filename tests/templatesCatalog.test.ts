import { describe, expect, test } from 'bun:test'
import { NATIVE_KEYS, NATIVE_MODIFIERS } from '../src/lib/nativeBinding'
import { serializeNativeProfile } from '../src/lib/nativeRemapping'
import { KEY_TEMPLATES, TEMPLATE_CATALOG, templateById, templateKeys, templateProfile, templateRules, type KeyTemplate } from '../src/lib/templates'

const keys = new Set(NATIVE_KEYS)
const holdMods = new Set(NATIVE_MODIFIERS.filter(m => m.startsWith('left_') || m.startsWith('right_')))
const HOLD = ['balanced', 'hold_preferred', 'tap_preferred', 'opposite_hand']
const present = (s: unknown) => typeof s === 'string' && s.trim().length > 0

/** The engine's own profile checks (native/engine/src/lib.rs), restated for the JSON the app would send. */
function compileErrors(t: KeyTemplate): string[] {
  const errors: string[] = []
  const profile = templateProfile(t)
  if (JSON.parse(serializeNativeProfile(profile)).rules.length !== t.rules.length) errors.push('profile drops rules')
  if (profile.rules.length < 1 || profile.rules.length > 1024) errors.push('rule count')
  const layers = new Set(t.rules.flatMap(r => (r.type === 'layer_activator' ? [r.layerName] : [])))
  const seen = new Set<string>()
  const key = (k: string) => { if (!keys.has(k)) errors.push(`unsupported key ${k}`) }
  const mods = (m?: string[]) => (m ?? []).forEach(x => { if (!NATIVE_MODIFIERS.includes(x)) errors.push(`unsupported modifier ${x}`) })
  for (const r of t.rules) {
    if (!present(r.description)) errors.push('rule without description')
    if (r.type === 'combo') {
      r.fromKeys.forEach(key); key(r.toKey); mods(r.toModifiers)
      if (r.fromKeys.length < 2 || r.fromKeys.length > 8 || new Set(r.fromKeys).size !== r.fromKeys.length) errors.push('combo needs 2..8 distinct keys')
    } else if (r.type === 'simple') {
      key(r.fromKey); key(r.toKey); mods(r.fromModifiers); mods(r.toModifiers)
    } else if (r.type === 'layer_binding') {
      key(r.fromKey); key(r.toKey); mods(r.toModifiers)
      if (!layers.has(r.layerName)) errors.push(`binding on layer ${r.layerName} that nothing turns on`)
      const id = `${r.layerName}/${r.fromKey}`
      if (seen.has(id)) errors.push(`duplicate binding ${id}`)
      seen.add(id)
    } else {
      key(r.fromKey)
      if (seen.has(`base/${r.fromKey}`)) errors.push(`key ${r.fromKey} used twice`)
      seen.add(`base/${r.fromKey}`)
      if (r.type === 'layer_activator') {
        if (r.tapKey) key(r.tapKey)
        if (!r.layerName.trim() || new TextEncoder().encode(r.layerName).length > 64) errors.push('layer name')
        if (r.holdBehavior && !HOLD.includes(r.holdBehavior)) errors.push('hold behaviour')
      } else {
        key(r.tapKey)
        if (!holdMods.has(r.modKey)) errors.push(`modKey ${r.modKey} is not a left/right modifier`)
        if (r.holdThresholdMs !== undefined && (r.holdThresholdMs < 50 || r.holdThresholdMs > 1000)) errors.push('hold time out of range')
        if (r.holdBehavior && !HOLD.includes(r.holdBehavior)) errors.push('hold behaviour')
      }
    }
  }
  return errors
}

describe('MacBook key templates', () => {
  test('catalog is non-empty with unique ids and covers the popular families', () => {
    expect(KEY_TEMPLATES.length).toBeGreaterThanOrEqual(7)
    expect(new Set(KEY_TEMPLATES.map(t => t.id)).size).toBe(KEY_TEMPLATES.length)
    const categories = new Set(KEY_TEMPLATES.map(t => t.category))
    for (const c of ['caps', 'home-row', 'layers', 'combos']) expect(categories.has(c as never)).toBe(true)
    expect(templateById('combos-easy-reach')?.rules.filter(r => r.type === 'combo').map(r => r.type === 'combo' && [...r.fromKeys].sort().join('')))
      .toEqual(['kl', 'io', 'ew'])
  })

  test('every template has all its words, a source and a checked video link', () => {
    for (const t of KEY_TEMPLATES) {
      for (const f of [t.id, t.name, t.why, t.forWho]) expect(present(f)).toBe(true)
      expect(['easy', 'medium', 'tricky']).toContain(t.difficulty)
      expect(t.changes.length).toBeGreaterThan(0)
      t.changes.forEach(c => expect(present(c)).toBe(true))
      expect(t.rules.length).toBeGreaterThan(0)
      expect(t.source.url).toMatch(/^https:\/\//)
      for (const f of [t.source.title, t.source.note]) expect(present(f)).toBe(true)
      const v = t.video
      expect(v.url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}(&t=\d+s)?$/)
      expect(new URL(v.url).searchParams.get('v')).toBe(v.videoId)
      if (v.startSeconds !== undefined) expect(new URL(v.url).searchParams.get('t')).toBe(`${v.startSeconds}s`)
      for (const f of [v.title, v.channel, v.checkedHow, v.note]) expect(present(f)).toBe(true)
      for (const d of [v.published, v.checkedAt]) expect(d).toMatch(/^20\d\d-\d\d-\d\d$/)
      expect(v.published <= v.checkedAt).toBe(true)
    }
  })

  test('every template compiles as a native profile', () => {
    for (const t of KEY_TEMPLATES) expect({ id: t.id, errors: compileErrors(t) }).toEqual({ id: t.id, errors: [] })
  })

  test('user-facing words stay plain: no tool names, no unfinished text', () => {
    const words = JSON.stringify(TEMPLATE_CATALOG)
    expect(words).not.toMatch(/karabiner/i)
    expect(words).not.toMatch(/TODO|TBD|lorem/i)
    for (const t of KEY_TEMPLATES) for (const w of [t.why, t.forWho, ...t.changes]) expect(w.length).toBeLessThan(400)
  })

  test('home-row templates use the misfire-safe settings and stay on the home row', () => {
    for (const t of KEY_TEMPLATES.filter(t => t.category === 'home-row')) {
      for (const r of t.rules) {
        expect(r.type).toBe('homerow_mod')
        if (r.type === 'homerow_mod') {
          expect(r.holdBehavior).toBe('opposite_hand')
          expect(r.tapKey).toBe(r.fromKey)
          expect('asdfjkl;'.includes(r.fromKey === 'semicolon' ? ';' : r.fromKey)).toBe(true)
        }
      }
    }
  })

  test('left-out ideas are listed with a reason, and helpers copy rather than share rules', () => {
    for (const l of TEMPLATE_CATALOG.leftOut) { expect(present(l.name)).toBe(true); expect(present(l.reason)).toBe(true) }
    const t = KEY_TEMPLATES[0]
    const copy = templateRules(t)
    expect(copy).toEqual(t.rules)
    expect(copy).not.toBe(t.rules)
    expect(templateKeys(templateById('space-arrows')!)).toEqual(['spacebar'])
    expect(templateKeys(templateById('combos-easy-reach')!).sort()).toEqual(['e', 'i', 'k', 'l', 'o', 'w'])
  })
})
