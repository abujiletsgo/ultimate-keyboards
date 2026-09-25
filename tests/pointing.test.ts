import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { TEMPLATES, validateField, renderOverlay } from '../src/lib/pointing/templates'
import { planAdd, planRemove, westAddModule, westRemoveModule, unifiedDiff, type RepoFiles } from '../src/lib/pointing/apply'
import { detectPointingInOverlay } from '../src/lib/registry/detect'
import { parseDevicetree, syntaxErrorLines } from '../src/lib/dt/runtime'

const baseOverlay = '#include "corne.dtsi"\n\n&kscan0 {\n    col-gpios = <&gpio0 22 GPIO_ACTIVE_HIGH>;\n};\n'
const baseConf = 'CONFIG_ZMK_SLEEP=y\n'
const baseWest = readFileSync('/Users/tomkwon/Documents/cross_keyboard-crosses/config/west.yml', 'utf8')

const files = (west: string | null = baseWest): RepoFiles => ({
  overlayPath: '/x/corne_right.overlay', overlay: baseOverlay,
  confPath: '/x/corne_right.conf', conf: baseConf,
  westPath: west ? '/x/west.yml' : null, west,
})

describe('pointing templates', () => {
  test('every template renders a parseable overlay that the detector recognises', () => {
    for (const t of TEMPLATES) {
      const values = Object.fromEntries(t.fields.map(f => [f.key, f.value]))
      const overlay = renderOverlay(t, values, t.id)
      const tree = parseDevicetree(overlay)
      expect(syntaxErrorLines(tree)).toEqual([])
      const devs = detectPointingInOverlay(overlay, '/x.overlay')
      expect(devs.length).toBe(1)
      expect(devs[0].compatible).toBe(t.compatible)
      const d = t.descriptor(t.id)
      expect(new RegExp(d.sensorNodeRe).test(overlay)).toBe(true)
      expect(new RegExp(d.listenerNodeRe).test(overlay)).toBe(true)
    }
  })

  test('field validation', () => {
    const f = TEMPLATES[0].fields[0]
    expect(validateField(f, '0 17')).toBeNull()
    expect(validateField(f, '2 3')).not.toBeNull()
    expect(validateField(f, '0 40')).not.toBeNull()
    expect(validateField({ ...f, kind: 'int' }, '1100')).toBeNull()
    expect(validateField({ ...f, kind: 'int' }, '11x')).not.toBeNull()
  })
})

describe('add → remove is exact', () => {
  for (const t of TEMPLATES) {
    test(`${t.id}: overlay, conf and west return to their original bytes`, () => {
      const values = Object.fromEntries(t.fields.map(f => [f.key, f.value]))
      // start from a west.yml that does NOT already carry this template's module
      const westBase = t.west ? baseWest.replace(new RegExp(`[ \\t]*- name: ${t.west.project}\\n(?:[ \\t]{6,}\\S.*\\n)*`), '') : baseWest
      const f0 = { ...files(westBase) }
      const add = planAdd(t, values, t.id, f0)
      expect(add.overlay.after).toContain(`uk:pointing:${t.id}:begin`)
      expect(add.conf.after).toContain('CONFIG_ZMK_POINTING=y')
      if (t.west) { expect(add.west).not.toBeNull(); expect(add.west!.after).toContain(`name: ${t.west.project}`) }
      const f1: RepoFiles = { ...f0, overlay: add.overlay.after, conf: add.conf.after, west: add.west ? add.west.after : f0.west }
      const rm = planRemove(t.id, f1)
      expect(rm.overlay.after).toBe(baseOverlay)
      expect(rm.conf.after).toBe(baseConf)
      if (t.west) expect(rm.west!.after).toBe(westBase)
    })
  }

  test('a template that needs a module refuses a repo without west.yml', () => {
    const t = TEMPLATES.find(x => x.west)!
    expect(() => planAdd(t, {}, t.id, files(null))).toThrow()
  })

  test('adding the same id twice is refused', () => {
    const t = TEMPLATES[0]
    const add = planAdd(t, {}, t.id, files())
    expect(() => planAdd(t, {}, t.id, { ...files(), overlay: add.overlay.after })).toThrow()
  })
})

describe('west.yml editing', () => {
  test('adds remote + project before self, keeps existing entries, is idempotent, removes exactly', () => {
    const out = westAddModule(baseWest, 'petejohanson', 'https://github.com/petejohanson', 'cirque-input-module', 'main', 'cirque')
    expect(out).toContain('- name: petejohanson')
    expect(out.indexOf('cirque-input-module')).toBeLessThan(out.indexOf('self:'))
    expect(out).toContain('zmk-driver-azoteq-iqs5xx')
    expect(westAddModule(out, 'petejohanson', 'https://github.com/petejohanson', 'cirque-input-module', 'main', 'cirque')).toBe(out)
    expect(westRemoveModule(out, 'cirque')).toBe(baseWest)
  })

  test('re-using an existing remote adds only the project', () => {
    const out = westAddModule(baseWest, 'aym1607', 'https://github.com/AYM1607', 'zmk-other-module', 'v1', 'x')
    expect((out.match(/name: aym1607/g) ?? []).length).toBe(1)
    expect(out).toContain('- name: zmk-other-module')
  })
})

describe('diff preview', () => {
  test('shows added lines and collapses unchanged runs', () => {
    const a = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
    const b = a + '\nnew 1\nnew 2'
    const d = unifiedDiff(a, b, 'f')
    expect(d).toContain('+new 1')
    expect(d).toContain('unchanged lines')
    expect(d.split('\n').filter(l => l.startsWith('-')).length).toBe(1) // just the header
  })
})
