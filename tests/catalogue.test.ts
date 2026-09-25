import { describe, expect, test } from 'bun:test'
import { CATALOGUE_ITEMS, EMPTY_FILTER, ZMK_KEYBOARDS, filterCatalogue } from '../src/lib/catalogue'
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
    expect(zmkOnly.every(i => i.firmware === 'zmk' && i.split)).toBe(true)
    const byCount = filterCatalogue(CATALOGUE_ITEMS, { ...EMPTY_FILTER, query: '42' })
    expect(byCount.every(i => i.keyCount === 42 || i.haystack.includes('42'))).toBe(true)
    const tb = filterCatalogue(CATALOGUE_ITEMS, { ...EMPTY_FILTER, tags: ['trackball'] })
    expect(tb.length).toBeGreaterThan(0)
    expect(tb.every(i => i.tags.includes('trackball'))).toBe(true)
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
