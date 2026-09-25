import { describe, expect, test } from 'bun:test'
import { parseQmkPointing, applyQmkPointing, setMkVar, setDefine } from '../src/lib/pointing/qmk'

const rules = `# my keymap\nMOUSEKEY_ENABLE = yes\nPOINTING_DEVICE_ENABLE = yes   # trackball\nPOINTING_DEVICE_DRIVER = pmw3360\n`
const config = `#pragma once\n\n#define TAPPING_TERM 200\n#define POINTING_DEVICE_ROTATION_90\n#define POINTING_DEVICE_INVERT_X\n#define PMW33XX_CPI 1600\n`

describe('QMK pointing flags', () => {
  test('parses rules.mk + config.h', () => {
    const p = parseQmkPointing(rules, config)
    expect(p).toEqual({ enabled: true, driver: 'pmw3360', rotation: 90, invertX: true, invertY: false, cpi: 1600, cpiDefine: 'PMW33XX_CPI' })
  })

  test('absent flags parse as off', () => {
    expect(parseQmkPointing('', '')).toEqual({ enabled: false, driver: null, rotation: 0, invertX: false, invertY: false, cpi: null, cpiDefine: null })
  })

  test('apply only touches changed flags and keeps everything else byte-exact', () => {
    const before = parseQmkPointing(rules, config)
    const out = applyQmkPointing(rules, config, before, { ...before, rotation: 270, invertX: false, invertY: true, cpi: 800 })
    expect(out.rules).toBe(rules)
    expect(out.config).toBe(`#pragma once\n\n#define TAPPING_TERM 200\n#define POINTING_DEVICE_ROTATION_270\n#define PMW33XX_CPI 800\n#define POINTING_DEVICE_INVERT_Y\n`)
    // round trip
    const again = parseQmkPointing(out.rules, out.config)
    expect(again.rotation).toBe(270); expect(again.invertY).toBe(true); expect(again.invertX).toBe(false); expect(again.cpi).toBe(800)
  })

  test('enabling on an empty keymap appends, disabling rewrites in place', () => {
    const p0 = parseQmkPointing('', '')
    const on = applyQmkPointing('', '', p0, { ...p0, enabled: true, driver: 'cirque_pinnacle_i2c' })
    expect(on.rules).toBe('POINTING_DEVICE_ENABLE = yes\nPOINTING_DEVICE_DRIVER = cirque_pinnacle_i2c\n')
    const p1 = parseQmkPointing(on.rules, on.config)
    const off = applyQmkPointing(on.rules, on.config, p1, { ...p1, enabled: false })
    expect(off.rules).toBe('POINTING_DEVICE_ENABLE = no\nPOINTING_DEVICE_DRIVER = cirque_pinnacle_i2c\n')
  })

  test('a new config.h starts with #pragma once', () => {
    expect(setDefine('', 'POINTING_DEVICE_INVERT_X', '')).toBe('#pragma once\n\n#define POINTING_DEVICE_INVERT_X\n')
  })

  test('defines land inside an include guard', () => {
    const guarded = '#ifndef CONFIG_H\n#define CONFIG_H\n#define X 1\n#endif\n'
    expect(setDefine(guarded, 'POINTING_DEVICE_INVERT_Y', '')).toBe('#ifndef CONFIG_H\n#define CONFIG_H\n#define X 1\n#define POINTING_DEVICE_INVERT_Y\n#endif\n')
  })

  test('setMkVar handles := and ?= and removal', () => {
    expect(setMkVar('A := 1\nB ?= x\n', 'B', 'y')).toBe('A := 1\nB = y\n')
    expect(setMkVar('A := 1\nB ?= x\n', 'A', null)).toBe('B ?= x\n')
    expect(setMkVar('A := 1', 'C', 'z')).toBe('A := 1\nC = z\n')
  })
})
