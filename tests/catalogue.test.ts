import { describe, expect, test } from 'bun:test'
import { CATALOGUE_ITEMS, EMPTY_FILTER, ZMK_KEYBOARDS, filterCatalogue, qmkOnlineMatches, qmkPathName, wantsQmkOnline } from '../src/lib/catalogue'
import { buildYaml, controllersFor, keymapFileName, pinWestToMain } from '../src/lib/catalogue/newZmkConfig'
import { parseKeymapText } from '../src/lib/zmkParser'

describe('bundled ZMK catalogue', () => {
  test('has the popular splits, each with a layout, and previewable keymaps match their layout', () => {
    const ids = new Set(ZMK_KEYBOARDS.map(k => k.id))
    for (const id of ['corne', 'lily58', 'sofle', 'kyria', 'glove80']) expect(ids.has(id)).toBe(true)
    expect(ZMK_KEYBOARDS.filter(k => k.siblings.length).length).toBeGreaterThanOrEqual(30)
    for (const k of ZMK_KEYBOARDS) {
      expect(k.layout.keys.length).toBe(k.keyCount)
      if (k.keymapPreview) expect(parseKeymapText(k.keymap).layers[0].keys.length).toBe(k.keyCount)
    }
  })

  test('search and filters', () => {
    const corne = filterCatalogue(CATALOGUE_ITEMS, { ...EMPTY_FILTER, query: 'corne' })
    expect(corne.some(i => i.firmware === 'zmk')).toBe(true)
    expect(corne.some(i => i.firmware === 'qmk')).toBe(true)
    const zmkOnly = filterCatalogue(CATALOGUE_ITEMS, { ...EMPTY_FILTER, firmware: 'zmk' })
    expect(zmkOnly.every(i => i.firmware === 'zmk')).toBe(true)
    const splits = filterCatalogue(CATALOGUE_ITEMS, { ...EMPTY_FILTER, split: true })
    expect(splits.length).toBeGreaterThan(0)
    expect(splits.every(i => i.split === true)).toBe(true)
    const byCount = filterCatalogue(CATALOGUE_ITEMS, { ...EMPTY_FILTER, query: '42' })
    expect(byCount.every(i => i.keyCount === 42 || i.haystack.includes('42'))).toBe(true)
    const tb = filterCatalogue(CATALOGUE_ITEMS, { ...EMPTY_FILTER, tags: ['trackball'] })
    expect(tb.length).toBeGreaterThan(0)
    expect(tb.every(i => i.tags.includes('trackball'))).toBe(true)
  })
})

describe('single boards are found, not only splits', () => {
  test('the default filter shows single boards (nice!60, Planck, BT60)', () => {
    expect(EMPTY_FILTER.split).toBe(false)
    const all = filterCatalogue(CATALOGUE_ITEMS, EMPTY_FILTER)
    for (const id of ['nice60//zmk', 'planck//zmk', 'bt60//zmk']) expect(all.some(i => i.zmk?.id === id)).toBe(true)
    expect(all.filter(i => i.split === false).length).toBeGreaterThanOrEqual(30)
    expect(filterCatalogue(CATALOGUE_ITEMS, { ...EMPTY_FILTER, query: 'planck' }).length).toBeGreaterThan(0)
  })

  test('QMK online search: any keyboard by path or name, bundled ones excluded, capped', () => {
    const list = ['keychron/q1v2/ansi_encoder', 'keychron/q1v2/iso_encoder', 'gmmk/pro/rev1/ansi', 'planck/rev6', 'crkbd/rev1', 'splitkb/aurora/corne/rev1']
    const q = (query: string, extra = {}) => qmkOnlineMatches(list, { ...EMPTY_FILTER, query, ...extra }, CATALOGUE_ITEMS)
    expect(q('keychron q1').items.map(i => i.qmkPath)).toEqual(['keychron/q1v2/ansi_encoder', 'keychron/q1v2/iso_encoder'])
    expect(q('gmmk pro').items[0]).toMatchObject({ name: 'Gmmk Pro Ansi', firmware: 'qmk', split: null, reliability: 'online' })
    // bundled QMK splits are not listed twice
    expect(q('aurora corne').items).toEqual([])
    // the online list carries no tags, split flag or ZMK keyboards
    expect(q('planck', { firmware: 'zmk' }).items).toEqual([])
    expect(q('planck', { split: true }).items).toEqual([])
    expect(q('planck', { tags: ['rgb'] }).items).toEqual([])
    expect(q('p').items).toEqual([])
    const capped = qmkOnlineMatches(Array.from({ length: 100 }, (_, i) => `kb${i}/x`), { ...EMPTY_FILTER, query: 'kb' }, [], 10)
    expect(capped).toMatchObject({ total: 100 })
    expect(capped.items.length).toBe(10)
    expect(wantsQmkOnline({ ...EMPTY_FILTER, query: 'q1' })).toBe(true)
    expect(qmkPathName('planck/rev6')).toBe('Planck')
  })
})

describe('new zmk-config files', () => {
  const corne = ZMK_KEYBOARDS.find(k => k.id === 'corne')!
  test('split shield on nice!nano with Studio on the left half only', () => {
    const y = buildYaml({ keyboard: corne, controller: controllersFor(corne)[0], studio: true })
    expect(y).toContain('    shield: corne_left\n    snippet: studio-rpc-usb-uart\n    cmake-args: -DCONFIG_ZMK_STUDIO=y')
    expect(y).toContain('  - board: nice_nano//zmk\n    shield: corne_right\n')
    expect(y.match(/snippet/g)!.length).toBe(1)
    expect(y).toContain('shield: settings_reset')
    expect(keymapFileName(corne)).toBe('corne.keymap')
  })
  test('board keyboards list each half as a board', () => {
    const glove = ZMK_KEYBOARDS.find(k => k.id === 'glove80')!
    const y = buildYaml({ keyboard: glove, controller: null, studio: false })
    expect(y).toContain('  - board: glove80_lh\n')
    expect(y).not.toContain('shield:')
  })
  test('west pin', () => {
    expect(pinWestToMain('manifest:\n  defaults:\n    revision: v0.3\n')).toBe('manifest:\n  defaults:\n    revision: main\n')
  })
})
