import { expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseQMKViaJson, layoutToRawMap } from '../src/lib/qmkParser'
import { LEGACY_CORNE_PROCYON } from '../src/lib/layout'

const LEGACY = [0, 1, 2, 3, 4, 5, 24, 25, 26, 27, 28, 29, 6, 7, 8, 9, 10, 11, 30, 31, 32, 33, 34, 35, 12, 13, 14, 15, 16, 17, 36, 37, 38, 39, 40, 41, 20, 21, 22, 23, 42, 43, 44, 45]

test('the owner\'s Procyon VIA export keeps the exact pre-registry key order', () => {
  const text = readFileSync(join(import.meta.dir, 'fixtures', 'repo', 'corne_procyon.layout.json'), 'utf8')
  const km = parseQMKViaJson(text, LEGACY_CORNE_PROCYON)
  expect(km.map).toEqual(LEGACY)
})

test('configurator keymap.json and same-length files map 1:1', () => {
  expect(layoutToRawMap(42, undefined, true)).toEqual(Array.from({ length: 42 }, (_, i) => i))
  const layout = { name: 'x', source: 'info-json' as const, keys: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }
  expect(layoutToRawMap(2, layout)).toEqual([0, 1])
})

test('VIA matrix order uses row * cols + col', () => {
  // 2 rows × 3 cols matrix, layout lists (1,2) then (0,0)
  const layout = { name: 'x', source: 'info-json' as const, keys: [{ x: 0, y: 0, row: 1, col: 2 }, { x: 1, y: 0, row: 0, col: 0 }] }
  expect(layoutToRawMap(6, layout)).toEqual([5, 0])
  const km = parseQMKViaJson(JSON.stringify({ layers: [['a', 'b', 'c', 'd', 'e', 'f']] }), layout)
  expect(km.layers[0].keys).toEqual(['f', 'a'])
})
