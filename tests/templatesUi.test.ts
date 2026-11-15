import { describe, expect, test } from 'bun:test'
import {
  BLURB_MAX, KEY_TEMPLATES, SHORT_NAME_MAX, TEMPLATES_SEEN_KEY, bindingMark, initialEditorTab, isCatalogLink, markTemplatesSeen,
  modGlyph, previewLabel, rolesFromRules, rolesUsed, templateRoles, templatesSeen, templateById, videoHref, videoMeta,
} from '../src/lib/templates'
import { MACBOOK_LAYOUT } from '../src/lib/macbookLayout'

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }

describe('card copy', () => {
  test('every template has a short name and a blurb within the limits', () => {
    for (const t of KEY_TEMPLATES) {
      expect(t.shortName.trim().length).toBeGreaterThan(0)
      expect(t.shortName.length).toBeLessThanOrEqual(SHORT_NAME_MAX)
      expect(t.blurb.trim().length).toBeGreaterThan(0)
      expect(t.blurb.length).toBeLessThanOrEqual(BLURB_MAX)
    }
  })
  test('user-facing copy never names the remapper driver', () => {
    const copy = JSON.stringify(KEY_TEMPLATES.map(t => [t.name, t.shortName, t.blurb, t.why, t.forWho, t.changes, t.caution]))
    expect(copy.toLowerCase()).not.toContain('karabiner')
  })
})

describe('TemplateKeyboard role map', () => {
  test('each rule type maps to its role and mark', () => {
    const caps = templateRoles(templateById('caps-esc-ctrl')!)
    expect(caps.get('caps_lock')).toEqual({ role: 'modtap', mark: '⌃' })
    const arrows = templateRoles(templateById('space-arrows')!)
    expect(arrows.get('spacebar')).toEqual({ role: 'layer', mark: 'hold' })
    expect(arrows.get('h')).toEqual({ role: 'binding', mark: '←' })
    const combos = templateRoles(templateById('combos-easy-reach')!)
    expect(combos.get('k')).toEqual({ role: 'combo', mark: 'K' })
    expect(templateRoles(templateById('symbols-layer')!).get('w')).toEqual({ role: 'binding', mark: '&' })
    expect(templateRoles(templateById('number-pad-layer')!).get('n')).toEqual({ role: 'binding', mark: '0' })
  })
  test('glyphs and shifted digits', () => {
    expect(['left_command', 'right_option', 'left_control', 'right_shift'].map(modGlyph)).toEqual(['⌘', '⌥', '⌃', '⇧'])
    expect(bindingMark('1', ['shift'])).toBe('!')
    expect(bindingMark('0', ['shift'])).toBe(')')
  })
  test('every changed key is on the cropped board (four lower rows)', () => {
    const lower = new Set(MACBOOK_LAYOUT.filter(k => k.y >= 1.75).map(k => k.code))
    for (const t of KEY_TEMPLATES) for (const code of templateRoles(t).keys()) expect(lower.has(code)).toBe(true)
  })
  test('only bindings of the asked-for layers are drawn; every role has a legend entry', () => {
    const t = templateById('space-arrows')!
    expect(rolesFromRules(t.rules, new Set(['other'])).has('h')).toBe(false)
    expect(rolesUsed(t)).toEqual(['layer', 'binding'])
    expect(previewLabel(t)).toContain('Other keys stay the same.')
  })
})

describe('video rows', () => {
  test('required fields are present and the link carries the start time', () => {
    for (const t of KEY_TEMPLATES) {
      for (const f of [t.video.url, t.video.title, t.video.channel, t.video.published, t.video.note]) expect(f.trim().length).toBeGreaterThan(0)
      expect(isCatalogLink(t.video.url)).toBe(true)
      expect(isCatalogLink(t.source.url)).toBe(true)
      expect(videoMeta(t.video)).toMatch(/ · (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/)
    }
    expect(videoHref({ url: 'https://www.youtube.com/watch?v=abc', startSeconds: 42 })).toBe('https://www.youtube.com/watch?v=abc&t=42s')
    expect(videoHref({ url: 'https://www.youtube.com/watch?v=abc' })).toBe('https://www.youtube.com/watch?v=abc')
  })
  test('only catalog pages can be opened', () => {
    expect(isCatalogLink('https://evil.example/x')).toBe(false)
    expect(isCatalogLink('http://www.youtube.com/watch?v=XuQVbZ0wENE')).toBe(false)
    expect(isCatalogLink('javascript:alert(1)')).toBe(false)
    expect(isCatalogLink('https://www.youtube.com/watch?v=notInTheCatalog')).toBe(false)
    expect(isCatalogLink('https://www.youtube.com/watch')).toBe(false)
  })
})

describe('first run', () => {
  test('Templates opens first until it has been shown once, then the usual tab', () => {
    const storage = memory()
    expect(templatesSeen(storage)).toBe(false)
    expect(initialEditorTab('keys', storage)).toBe('templates')
    markTemplatesSeen(storage)
    expect(storage.getItem(TEMPLATES_SEEN_KEY)).toBe('1')
    expect(initialEditorTab('keys', storage)).toBe('keys')
  })
  test('a storage that throws never blocks the editor', () => {
    const broken = { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') } }
    expect(initialEditorTab('keys', broken)).toBe('templates')
    expect(() => markTemplatesSeen(broken)).not.toThrow()
  })
})
