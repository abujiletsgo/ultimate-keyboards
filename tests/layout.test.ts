import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  parseZmkPhysicalLayouts, toZmkPhysicalLayoutDtsi,
  parseInfoJsonLayouts, toInfoJsonLayouts,
  parseMatrixTransforms, gridLayoutFromTransform,
  layoutBounds, LEGACY_CROSSES, LEGACY_CORNE_PROCYON,
} from '../src/lib/layout'

const fx = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8')

describe('ZMK physical-layout import', () => {
  test('corne 6-column: 42 keys, centi-units → key units, stagger preserved', () => {
    const nodes = parseZmkPhysicalLayouts(fx('layouts/corne_6column.dtsi'))
    expect(nodes.length).toBe(1)
    const l = nodes[0].layout
    expect(nodes[0].displayName).toBe('6 Column')
    expect(l.keys.length).toBe(42)
    expect(l.keys[0]).toEqual({ x: 0, y: 0.37 })
    expect(l.keys[3]).toEqual({ x: 3, y: 0 })
    const b = layoutBounds(l)
    expect(b.minX).toBe(0); expect(b.minY).toBe(0)
  })

  test('sofle: parses with rotated thumb keys carrying r/rx/ry', () => {
    const nodes = parseZmkPhysicalLayouts(fx('layouts/sofle.dtsi'))
    expect(nodes.length).toBeGreaterThan(0)
    const l = nodes[0].layout
    expect(l.keys.length).toBeGreaterThan(50)
    const rotated = l.keys.filter(k => k.r)
    expect(rotated.length).toBeGreaterThan(0)
    for (const k of rotated) { expect(k.rx).toBeDefined(); expect(k.ry).toBeDefined() }
  })

  test('round-trip: export → import yields identical key records', () => {
    const l = parseZmkPhysicalLayouts(fx('layouts/sofle.dtsi'))[0].layout
    const dtsi = toZmkPhysicalLayoutDtsi(l, 'test_layout')
    const back = parseZmkPhysicalLayouts(dtsi)[0].layout
    expect(back.keys).toEqual(l.keys)
  })
})

describe('info.json import', () => {
  test('keymap-editor info.json with row/col', () => {
    const ls = parseInfoJsonLayouts(fx('corne_tp.json'))
    expect(ls.length).toBe(1)
    expect(ls[0].id).toBe('default_layout')
    expect(ls[0].layout.keys.length).toBe(42)
    expect(ls[0].layout.keys[0]).toMatchObject({ x: 0, y: 0, row: 0, col: 0 })
  })

  test('QMK-style matrix + rotation round-trips through the exporter', () => {
    const src = JSON.stringify({ layouts: { LAYOUT: { layout: [
      { matrix: [0, 0], x: 0, y: 0 },
      { matrix: [0, 1], x: 1, y: 0.25, w: 1.5 },
      { matrix: [1, 0], x: 2, y: 1, r: 15, rx: 2, ry: 1 },
    ] } } })
    const ls = parseInfoJsonLayouts(src)
    expect(ls[0].layout.keys[1]).toMatchObject({ w: 1.5, row: 0, col: 1 })
    expect(ls[0].layout.keys[2]).toMatchObject({ r: 15, rx: 2, ry: 1 })
    const back = parseInfoJsonLayouts(toInfoJsonLayouts(ls))
    expect(back[0].layout.keys).toEqual(ls[0].layout.keys)
  })
})

describe('matrix-transform grid fallback', () => {
  test('corne_tp shield: 42 positions in map order, split gap inserted', () => {
    const src = readFileSync(join(import.meta.dir, 'fixtures', 'repo', 'corne_tp.dtsi'), 'utf8')
    const ts = parseMatrixTransforms(src)
    expect(ts.length).toBe(1)
    expect(ts[0].map.length).toBe(42)
    expect(ts[0].map[0]).toEqual([0, 0])
    expect(ts[0].map[6]).toEqual([0, 11])
    const l = gridLayoutFromTransform(ts[0])
    expect(l.keys.length).toBe(42)
    // right half is pushed right by the 0.5u gap
    expect(l.keys[6].x).toBeGreaterThan(l.keys[5].x + 1)
  })
})

describe('legacy layouts', () => {
  test('crosses 42 and corne procyon 44 convert with hands assigned', () => {
    expect(LEGACY_CROSSES.keys.length).toBe(42)
    expect(LEGACY_CROSSES.keys.filter(k => k.hand === 'L').length).toBe(21)
    expect(LEGACY_CORNE_PROCYON.keys.length).toBe(44)
    expect(LEGACY_CORNE_PROCYON.keys.filter(k => k.encoder).length).toBe(2)
  })
})
