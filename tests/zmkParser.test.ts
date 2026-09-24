import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  parseKeymapText,
  updateCombosInSource,
  updateLayerBindingsInSource,
} from '../src/lib/zmkParser'

const fixture = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8')
const FIXTURES = ['corne_tp.keymap', 'crosses.keymap']

function roundTrip(src: string): string {
  const km = parseKeymapText(src)
  return updateCombosInSource(updateLayerBindingsInSource(src, km.layers), km.combos)
}

describe('minimal-diff serializer', () => {
  for (const name of FIXTURES) {
    test(`${name}: no-op save is byte-identical`, () => {
      const src = fixture(name)
      expect(roundTrip(src)).toBe(src)
    })

    test(`${name}: one binding edit changes exactly one line`, () => {
      const src = fixture(name)
      const km = parseKeymapText(src)
      const layer = km.layers[0]
      const pos = layer.keys.findIndex(k => k.startsWith('&kp '))
      expect(pos).toBeGreaterThanOrEqual(0)
      const edited = {
        ...km,
        layers: km.layers.map((l, i) => (i === 0 ? { ...l, keys: l.keys.map((k, j) => (j === pos ? '&kp F24' : k)) } : l)),
      }
      const out = updateLayerBindingsInSource(src, edited.layers)
      const a = src.split('\n'), b = out.split('\n')
      expect(b.length).toBe(a.length)
      const changed = a.filter((line, i) => line !== b[i]).length
      expect(changed).toBe(1)
      // and it parses back to the same shape with the new binding
      const km2 = parseKeymapText(out)
      expect(km2.layers.length).toBe(km.layers.length)
      expect(km2.layers[0].keys[pos]).toBe('&kp F24')
    })
  }
})

describe('parser hardening', () => {
  test('a 200 KB run of identifier characters parses fast (no quadratic scan)', () => {
    const hostile = 'a'.repeat(200_000)
    const src = `/ {\n    keymap {\n        compatible = "zmk,keymap";\n        ${hostile}\n    };\n};\n`
    const t0 = performance.now()
    const km = parseKeymapText(src)
    const ms = performance.now() - t0
    expect(km.layers.length).toBe(0)
    expect(ms).toBeLessThan(500)
  })

  test('a behaviors node that shares a layer name is never edited in its place', () => {
    const src = [
      '/ {',
      '    behaviors {',
      '        Primary: primary_hold {',
      '            compatible = "zmk,behavior-hold-tap";',
      '            bindings = <&kp>, <&kp>;',
      '        };',
      '    };',
      '    keymap {',
      '        compatible = "zmk,keymap";',
      '        Primary {',
      '            bindings = <&kp A &kp B>;',
      '        };',
      '    };',
      '};',
      '',
    ].join('\n')
    const km = parseKeymapText(src)
    expect(km.layers.length).toBe(1)
    expect(km.layers[0].keys).toEqual(['&kp A', '&kp B'])
    const out = updateLayerBindingsInSource(src, [{ ...km.layers[0], keys: ['&kp C', '&kp B'] }])
    // behaviors node untouched, layer edited
    expect(out).toContain('bindings = <&kp>, <&kp>;')
    expect(out).toContain('bindings = <&kp C &kp B>;')
    expect(out.split('\n').length).toBe(src.split('\n').length)
  })
})
