import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  parseKeymapText, updateLayerBindingsInSource, updateCombosInSource,
  addLayerToSource, renameLayerInSource, deleteLayerFromSource,
} from '../src/lib/zmkParser'

const CORPUS = join(import.meta.dir, 'corpus')
const FIXTURES = join(import.meta.dir, 'fixtures')
const files = [
  ...readdirSync(FIXTURES).filter(f => f.endsWith('.keymap')).map(f => join(FIXTURES, f)),
  ...readdirSync(CORPUS).filter(f => f.endsWith('.keymap')).map(f => join(CORPUS, f)),
]

function roundTrip(src: string): string {
  const km = parseKeymapText(src)
  return updateCombosInSource(updateLayerBindingsInSource(src, km.layers), km.combos)
}

function changedLines(a: string, b: string): number {
  const la = a.split('\n'), lb = b.split('\n')
  if (la.length !== lb.length) return Infinity
  return la.filter((l, i) => l !== lb[i]).length
}

describe('devicetree-CST keymap parser: corpus golden tests', () => {
  for (const file of files) {
    const name = file.split('/').pop()!
    const src = readFileSync(file, 'utf8')
    test(`${name}: no-op save is byte-identical`, () => {
      expect(roundTrip(src)).toBe(src)
    })
    test(`${name}: parses layers and reports syntax errors honestly`, () => {
      const km = parseKeymapText(src)
      if (name.startsWith('urob')) {
        // macro-defined layers: the CST has errors and no keymap node we own
        expect(km.syntaxErrors.length).toBeGreaterThan(0)
      } else {
        expect(km.syntaxErrors).toEqual([])
        expect(km.layers.length).toBeGreaterThan(0)
        const n = km.layers[0].keys.length
        for (const l of km.layers) expect(l.keys.length).toBe(n)
      }
    })
    test(`${name}: one binding edit changes exactly one line`, () => {
      const km = parseKeymapText(src)
      if (km.layers.length === 0) return
      const layer = km.layers[0]
      const pos = layer.keys.findIndex(k => /^&kp \w+$/.test(k))
      if (pos < 0) return
      const layers = km.layers.map((l, i) => i === 0 ? { ...l, keys: l.keys.map((k, j) => j === pos ? '&kp F24' : k) } : l)
      const out = updateLayerBindingsInSource(src, layers)
      expect(changedLines(src, out)).toBe(1)
      expect(parseKeymapText(out).layers[0].keys[pos]).toBe('&kp F24')
    })
  }
})

describe('CRLF and comments', () => {
  test('CRLF source survives a no-op and a one-key edit', () => {
    const src = readFileSync(join(FIXTURES, 'corne_tp.keymap'), 'utf8').replace(/\n/g, '\r\n')
    expect(roundTrip(src)).toBe(src)
    const km = parseKeymapText(src)
    const layers = km.layers.map((l, i) => i === 0 ? { ...l, keys: l.keys.map((k, j) => j === 1 ? '&kp F24' : k) } : l)
    const out = updateLayerBindingsInSource(src, layers)
    expect(out.split('\r\n').length).toBe(src.split('\r\n').length)
    expect(parseKeymapText(out).layers[0].keys[1]).toBe('&kp F24')
  })

  test('comments inside bindings are preserved and skipped', () => {
    const src = '/ {\n    keymap {\n        compatible = "zmk,keymap";\n        L0 {\n            bindings = <&kp A /* one */ &kp B // two\n            &kp C>;\n        };\n    };\n};\n'
    const km = parseKeymapText(src)
    expect(km.layers[0].keys).toEqual(['&kp A', '&kp B', '&kp C'])
    const out = updateLayerBindingsInSource(src, [{ ...km.layers[0], keys: ['&kp A', '&kp X', '&kp C'] }])
    expect(out).toContain('/* one */')
    expect(out).toContain('// two')
    expect(out).toContain('&kp X')
  })
})

describe('combos', () => {
  const src = readFileSync(join(FIXTURES, 'corne_tp.keymap'), 'utf8')

  test('edit bindings / positions / layers in place; add layers property; remove it', () => {
    const km = parseKeymapText(src)
    const esc = km.combos.find(c => c.name === 'esc')!
    const del = km.combos.find(c => c.name === 'delete')!
    const next = km.combos.map(c =>
      c.name === 'esc' ? { ...c, bindings: '&kp GRAVE', keyPositions: [1, 2, 3], layers: [0, 1] } :
      c.name === 'delete' ? { ...c, layers: undefined } : c)
    const out = updateCombosInSource(src, next)
    const km2 = parseKeymapText(out)
    expect(km2.combos.find(c => c.name === 'esc')).toMatchObject({ bindings: '&kp GRAVE', keyPositions: [1, 2, 3], layers: [0, 1] })
    expect(km2.combos.find(c => c.name === 'delete')!.layers).toBeUndefined()
    expect(km2.combos.length).toBe(km.combos.length)
    expect(esc.layers).toBeUndefined()
    expect(del.layers).toEqual([3, 7])
    // everything else untouched
    expect(km2.layers).toEqual(km.layers)
  })

  test('add and remove a combo; untouched nodes stay byte-identical', () => {
    const km = parseKeymapText(src)
    const added = updateCombosInSource(src, [...km.combos, { name: 'new_one', bindings: '&kp Z', keyPositions: [4, 5], layers: [2] }])
    const km2 = parseKeymapText(added)
    expect(km2.combos.length).toBe(km.combos.length + 1)
    expect(km2.combos.at(-1)).toMatchObject({ name: 'new_one', bindings: '&kp Z', keyPositions: [4, 5], layers: [2] })
    const removed = updateCombosInSource(added, km2.combos.filter(c => c.name !== 'new_one'))
    expect(removed).toBe(src)
    const without = updateCombosInSource(src, km.combos.filter(c => c.name !== 'Enter'))
    expect(parseKeymapText(without).combos.find(c => c.name === 'Enter')).toBeUndefined()
    expect(without).not.toContain('key-positions = <21 20>')
  })

  test('a file without a combos block gets one inserted before keymap', () => {
    const bare = '/ {\n    keymap {\n        compatible = "zmk,keymap";\n        L0 { bindings = <&kp A>; };\n    };\n};\n'
    const out = updateCombosInSource(bare, [{ name: 'c1', bindings: '&kp B', keyPositions: [0, 1] }])
    const km = parseKeymapText(out)
    expect(km.combos).toEqual([{ name: 'c1', bindings: '&kp B', keyPositions: [0, 1], layers: undefined }])
    expect(km.layers[0].keys).toEqual(['&kp A'])
  })
})

describe('layers', () => {
  const src = readFileSync(join(FIXTURES, 'corne_tp.keymap'), 'utf8')

  test('add → rename → delete returns to the original bytes', () => {
    const n = parseKeymapText(src).layers[0].keys.length
    const added = addLayerToSource(src, 'Extra', n)
    const km = parseKeymapText(added)
    expect(km.layers.at(-1)).toMatchObject({ name: 'Extra', displayName: 'Extra' })
    expect(km.layers.at(-1)!.keys.every(k => k === '&trans')).toBe(true)
    expect(km.layers.at(-1)!.keys.length).toBe(n)
    const renamed = renameLayerInSource(added, 'Extra', 'Spare')
    expect(parseKeymapText(renamed).layers.at(-1)).toMatchObject({ name: 'Spare', displayName: 'Spare' })
    const deleted = deleteLayerFromSource(renamed, 'Spare')
    expect(deleted).toBe(src)
  })

  test('renaming a layer never touches a behaviors node with the same name', () => {
    const s = '/ {\n    behaviors {\n        Primary: primary_hold { compatible = "zmk,behavior-hold-tap"; bindings = <&kp>, <&kp>; };\n    };\n    keymap {\n        compatible = "zmk,keymap";\n        Primary { display-name = "Primary"; bindings = <&kp A>; };\n    };\n};\n'
    const out = renameLayerInSource(s, 'Primary', 'Base')
    expect(out).toContain('Primary: primary_hold')
    expect(out).toContain('Base { display-name = "Base"; bindings = <&kp A>; };')
  })
})
