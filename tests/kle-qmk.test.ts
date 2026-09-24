import { describe, expect, test } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { parseKle, toKle } from '../src/lib/layout/kle'
import { parseQMKViaJson, toVIARaw } from '../src/lib/qmkParser'

describe('KLE import', () => {
  test('stateful cursor: offsets, widths, row advance, VIA row,col legends', () => {
    const kle = [
      [{ w: 1.5 }, '0,0', '0,1', { x: 0.25 }, '0,2'],
      [{ y: 0.5 }, '1,0', { w: 2, h: 2 }, '1,1'],
      [{ r: 15, rx: 3, ry: 3 }, '2,0', '2,1'],
    ]
    const l = parseKle(kle, 'test')
    expect(l.keys.length).toBe(7)
    expect(l.keys[0]).toMatchObject({ x: 0, y: 0, w: 1.5, row: 0, col: 0 })
    expect(l.keys[1]).toMatchObject({ x: 1.5, y: 0 })
    expect(l.keys[2]).toMatchObject({ x: 2.75, y: 0 })
    expect(l.keys[3]).toMatchObject({ x: 0, y: 1.5 })
    expect(l.keys[4]).toMatchObject({ x: 1, y: 1.5, w: 2, h: 2 })
    expect(l.keys[5]).toMatchObject({ x: 3, y: 3, r: 15, rx: 3, ry: 3 })
    expect(l.keys[6]).toMatchObject({ x: 4, y: 3, r: 15 })
  })

  test('decal entries are skipped; metadata object rows are ignored', () => {
    const l = parseKle([{ name: 'meta' }, ['0,0', { d: true }, 'label', '0,1']])
    expect(l.keys.length).toBe(2)
    // the decal still advanced the cursor, so the second key sits 2u right of the first
    expect(l.keys[1].x - l.keys[0].x).toBe(2)
  })

  test('export → import round-trips key geometry', () => {
    const l = parseKle([[ '0,0', { x: 0.5, w: 1.25 }, '0,1' ], [{ y: 0.25 }, '1,0', '1,1', '1,2'], [{ r: 10, rx: 2, ry: 2 }, '2,0']])
    const back = parseKle(toKle(l))
    expect(back.keys).toEqual(l.keys)
  })
})

describe('QMK VIA layout JSON: unknown fields survive a save', () => {
  const path = '/Users/tomkwon/Documents/splitkey2/corne_procyon/corne_procyon.layout.json'
  const has = existsSync(path)
  test.skipIf(!has)('merging edited layers back keeps every other field byte-for-byte', () => {
    const text = readFileSync(path, 'utf8')
    const km = parseQMKViaJson(text)
    expect(km.layers.length).toBeGreaterThan(0)
    // no-op: parse → raw → merge yields identical layers and untouched siblings
    const original = JSON.parse(text)
    const merged = JSON.parse(text)
    merged.layers = toVIARaw(km)
    expect(merged.layers).toEqual(original.layers)
    for (const k of Object.keys(original)) {
      if (k !== 'layers') expect(merged[k]).toEqual(original[k])
    }
    // one-key edit changes exactly one keycode in the raw layers
    const edited = { ...km, layers: km.layers.map((l, i) => i === 0 ? { ...l, keys: l.keys.map((k, j) => j === 0 ? 'KC_F24' : k) } : l) }
    const raw2 = toVIARaw(edited)
    const flat1 = (original.layers as unknown[]).flat(2), flat2 = (raw2 as unknown[]).flat(2)
    expect(flat1.length).toBe(flat2.length)
    expect(flat1.filter((v, i) => v !== flat2[i]).length).toBe(1)
  })
})
