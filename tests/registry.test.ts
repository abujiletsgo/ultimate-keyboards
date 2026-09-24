import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { detectPointingInOverlay } from '../src/lib/registry/detect'
import { checkZmkCompatibility } from '../src/lib/compat'
import { findCatalogueLayout, catalogueByKeyCount, CATALOGUE } from '../src/lib/layout/catalogue'

const fx = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8')

describe('pointing detection in overlays', () => {
  test('corne_tp right overlay → Azoteq trackpad with its listener', () => {
    const src = readFileSync('/Users/tomkwon/Documents/cross_keyboard/config/boards/shields/corne_tp/corne_tp_right.overlay', 'utf8')
    const devs = detectPointingInOverlay(src, '/x/corne_tp_right.overlay')
    expect(devs.length).toBe(1)
    expect(devs[0]).toMatchObject({ id: 'trackpad', chip: 'Azoteq IQS5XX', compatible: 'azoteq,iqs5xx' })
    expect(new RegExp(devs[0].sensorNodeRe).test(src)).toBe(true)
    expect(new RegExp(devs[0].listenerNodeRe).test(src)).toBe(true)
    expect(devs[0].listenerNodeRe).toContain('trackpad_listener')
  })

  test('crosses right overlay → PMW3610 trackball', () => {
    const src = readFileSync('/Users/tomkwon/Documents/cross_keyboard-crosses/config/boards/shields/crosses/crosses_right.overlay', 'utf8')
    const devs = detectPointingInOverlay(src, '/x/crosses_right.overlay')
    expect(devs.length).toBe(1)
    expect(devs[0].chip).toBe('Pixart PMW3610')
    expect(new RegExp(devs[0].sensorNodeRe).test(src)).toBe(true)
  })

  test('overlay without sensors → none', () => {
    expect(detectPointingInOverlay('/ { kscan0: kscan { compatible = "zmk,kscan-gpio-matrix"; }; };', '/x')).toEqual([])
  })
})

describe('compatibility report', () => {
  test('a plain keymap is editable with no issues', () => {
    const r = checkZmkCompatibility(fx('corne_tp.keymap'))
    expect(r.editable).toBe(true)
    expect(r.issues.filter(i => i.blocking)).toEqual([])
  })

  test('#ifdef inside the keymap block is blocking; outside it is not', () => {
    const outside = '#ifdef FOO\n#define X 1\n#endif\n/ {\n    keymap {\n        compatible = "zmk,keymap";\n        L0 { bindings = <&kp A>; };\n    };\n};\n'
    const inside = '/ {\n    keymap {\n        compatible = "zmk,keymap";\n#ifdef FOO\n        L0 { bindings = <&kp A>; };\n#endif\n    };\n};\n'
    expect(checkZmkCompatibility(outside).editable).toBe(true)
    const r = checkZmkCompatibility(inside)
    expect(r.editable).toBe(false)
    expect(r.issues.some(i => i.blocking && i.construct === 'preprocessor conditional' && i.line === 4)).toBe(true)
  })

  test('local include of a .dtsi is blocking; no keymap block is blocking', () => {
    expect(checkZmkCompatibility('#include "layers.dtsi"\n/ { keymap { compatible = "zmk,keymap"; }; };\n').editable).toBe(false)
    expect(checkZmkCompatibility('/ { behaviors { }; };\n').editable).toBe(false)
  })
})

describe('catalogue matching', () => {
  test('shield names resolve to the right family and key count', () => {
    expect(findCatalogueLayout('corne_left', 42)?.board).toBe('corne')
    expect(findCatalogueLayout('corne_left', 42)?.keyCount).toBe(42)
    expect(findCatalogueLayout('corne', 36)?.keyCount).toBe(36)
    expect(findCatalogueLayout('lily58_right')?.board).toBe('lily58')
    expect(findCatalogueLayout('sofle')?.keyCount).toBe(60)
    expect(findCatalogueLayout('crosses')).toBeNull()
  })

  test('catalogue is bundled and normalized', () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(39)
    expect(catalogueByKeyCount(42).length).toBeGreaterThanOrEqual(2)
    for (const e of CATALOGUE) expect(e.layout.keys.length).toBe(e.keyCount)
  })
})
