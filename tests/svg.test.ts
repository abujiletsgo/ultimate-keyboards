import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { keymapToSvg } from '../src/lib/export/svg'
import { parseKeymapText } from '../src/lib/zmkParser'
import { LEGACY_CROSSES } from '../src/lib/layout'

const src = readFileSync(join(import.meta.dir, 'fixtures', 'corne_tp.keymap'), 'utf8')

describe('SVG export', () => {
  test('one board per layer, one rect per key, combos drawn where active, well-formed', () => {
    const km = parseKeymapText(src)
    const svg = keymapToSvg(LEGACY_CROSSES, km.layers, { combos: km.combos, title: 'Corne' })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trim().endsWith('</svg>')).toBe(true)
    // 42 keys × 9 layers + 9 board rects + 1 background + combo pills
    const rects = (svg.match(/<rect /g) ?? []).length
    expect(rects).toBeGreaterThanOrEqual(42 * km.layers.length + km.layers.length + 1)
    expect(svg).toContain('0 · QWERTY')
    expect(svg).toContain('8 · Num+Nav')
    // a layer-filtered combo (delete: layers 3 7) appears twice, an unfiltered one on every layer
    expect((svg.match(/>DEL</g) ?? []).length).toBe(2)
    expect((svg.match(/>ENT</g) ?? []).length).toBeGreaterThanOrEqual(km.layers.length)
    // labels are escaped
    expect(svg).not.toContain('<&')
    expect(svg).toContain('HOLD L1')
  })
})
