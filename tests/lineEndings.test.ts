import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'fs'
import { basename, join } from 'path'
import { detectEol, keepEol } from '../src/lib/lineEndings'
import { TEMPLATES } from '../src/lib/pointing/templates'
import { planAdd, planRemove, westAddModule, westRemoveModule, type RepoFiles } from '../src/lib/pointing/apply'
import { addBehavior, removeBehavior, setBehaviorProp, parseBehaviors, joinCells } from '../src/lib/dt/behaviors'
import { parseKeymapText, updateCombosInSource, updateLayerBindingsInSource, addLayerToSource, renameLayerInSource, deleteLayerFromSource } from '../src/lib/zmkParser'
import { setKey, readKey } from '../src/lib/zmkSleep'
import { setMkVar, setDefine, applyQmkPointing, parseQmkPointing } from '../src/lib/pointing/qmk'
import { setBoolProp, setIntProp, setSnipe, findNode } from '../src/lib/pointingParser'
import { parseQMKCombos, updateQMKCombosInSource } from '../src/lib/qmkComboParser'
import { parseBuildTargets } from '../src/lib/registry/parts'
import { checkZmkCompatibility } from '../src/lib/compat'

const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n')
const stray = (s: string) => /\r\r|(^|[^\r])\n/.test(s)   // a bare LF, or a doubled CR
const fx = (...p: string[]) => readFileSync(join(import.meta.dir, ...p), 'utf8')

const CORPUS = join(import.meta.dir, 'corpus')
const baseWest = fx('fixtures', 'repo', 'west.yml')
const baseOverlay = '#include "corne.dtsi"\n\n&kscan0 {\n    col-gpios = <&gpio0 22 GPIO_ACTIVE_HIGH>;\n};\n'
const baseConf = 'CONFIG_ZMK_SLEEP=y\n'

describe('keepEol', () => {
  test('detects the majority ending', () => {
    expect(detectEol('a\r\nb\r\n')).toBe('\r\n')
    expect(detectEol('a\nb\n')).toBe('\n')
    expect(detectEol('a\r\nb\nc\r\n')).toBe('\r\n')
    expect(detectEol('no break')).toBe('\n')
  })
  test('LF text is passed through untouched; an unchanged CRLF text comes back as is', () => {
    expect(keepEol('a\nb\n', s => s + 'c\n')).toBe('a\nb\nc\n')
    expect(keepEol('a\r\nb\nc\r\n', s => s)).toBe('a\r\nb\nc\r\n')
  })
  test('a mixed file keeps each untouched line as is; new lines take the majority', () => {
    const src = 'a\r\nb\nc\r\nd\r\ne\n'
    expect(keepEol(src, s => s.replace('c\n', 'c\nnew\n'))).toBe('a\r\nb\nc\r\nnew\r\nd\r\ne\n')
    expect(keepEol(src, s => s.replace('b\n', ''))).toBe('a\r\nc\r\nd\r\ne\n')
    expect(keepEol(src, s => s.replace('e\n', 'e'))).toBe('a\r\nb\nc\r\nd\r\ne')
  })
})

describe('CRLF: keymap round trip over the corpus', () => {
  const files = [
    ...readdirSync(join(import.meta.dir, 'fixtures')).filter(f => f.endsWith('.keymap')).map(f => join(import.meta.dir, 'fixtures', f)),
    ...readdirSync(CORPUS).filter(f => f.endsWith('.keymap')).map(f => join(CORPUS, f)),
  ]
  for (const file of files) {
    const name = basename(file)
    const lf = readFileSync(file, 'utf8')
    const src = crlf(lf)
    test(`${name}: parses like the LF file and a no-op save is byte-identical`, () => {
      const a = parseKeymapText(lf), b = parseKeymapText(src)
      expect(b.layers).toEqual(a.layers)
      expect(b.combos).toEqual(a.combos)
      expect(b.syntaxErrors).toEqual(a.syntaxErrors)
      expect(b.rawSource).toBe(src)
      expect(updateCombosInSource(updateLayerBindingsInSource(src, b.layers), b.combos)).toBe(src)
    })
  }

  test('edits stay CRLF and equal the LF edit converted', () => {
    const lf = fx('corpus', 'corne.keymap')
    const src = crlf(lf)
    const km = parseKeymapText(src)
    const layers = km.layers.map((l, i) => i === 0 ? { ...l, keys: l.keys.map((k, j) => j === 0 ? '&kp Z' : k) } : l)
    const out = updateLayerBindingsInSource(src, layers)
    expect(out).toBe(crlf(updateLayerBindingsInSource(lf, layers)))
    expect(out).not.toBe(src)
    expect(stray(out)).toBe(false)

    const added = addLayerToSource(src, 'extra', km.layers[0].keys.length)
    expect(added).toBe(crlf(addLayerToSource(lf, 'extra', km.layers[0].keys.length)))
    expect(stray(added)).toBe(false)
    expect(deleteLayerFromSource(added, 'extra')).toBe(src)
    const renamed = renameLayerInSource(src, km.layers[1].name, 'renamed')
    expect(stray(renamed)).toBe(false)
    expect(renamed).toBe(crlf(renameLayerInSource(lf, km.layers[1].name, 'renamed')))

    const combo = { name: 'combo_x', bindings: '&kp X', keyPositions: [1, 2] }
    const withCombo = updateCombosInSource(src, [...km.combos, combo])
    expect(stray(withCombo)).toBe(false)
    expect(withCombo).toBe(crlf(updateCombosInSource(lf, [...km.combos, combo])))
    expect(updateCombosInSource(withCombo, km.combos)).toBe(crlf(updateCombosInSource(updateCombosInSource(lf, [...km.combos, combo]), km.combos)))
  })

  test('combos block created in a CRLF keymap that has none', () => {
    const lf = fx('corpus', 'corne.keymap')
    expect(parseKeymapText(lf).combos.length).toBe(0)
    const combo = { name: 'combo_x', bindings: '&kp X', keyPositions: [1, 2] }
    const out = updateCombosInSource(crlf(lf), [combo])
    expect(stray(out)).toBe(false)
    expect(out).toBe(crlf(updateCombosInSource(lf, [combo])))
    expect(parseKeymapText(out).combos.length).toBe(1)
  })

  test('a mixed keymap keeps every line it did not touch', () => {
    const lines = fx('corpus', 'corne.keymap').split('\n')
    const src = lines.map((l, i) => i % 3 === 0 ? l + '\r' : l).join('\n')
    const km = parseKeymapText(src)
    const out = addLayerToSource(src, 'extra', km.layers[0].keys.length)
    expect(out.startsWith(src.slice(0, 400))).toBe(true)
    expect(out).toContain('extra')
    expect(deleteLayerFromSource(out, 'extra')).toBe(src)
  })
})

describe('CRLF: behaviors', () => {
  const lf = fx('fixtures', 'corne_tp.keymap')
  const src = crlf(lf)
  test('add → remove and property edits are exact and stay CRLF', () => {
    const nb = {
      label: 'hml', name: 'homerow_mods_left', compatible: 'zmk,behavior-hold-tap',
      props: [
        { name: '#binding-cells', value: '<2>' },
        { name: 'bindings', value: joinCells(['&kp', '&kp']) },
        { name: 'hold-trigger-on-release', value: '' },
      ],
    }
    const s = addBehavior(src, nb)
    expect(stray(s)).toBe(false)
    expect(s).toBe(crlf(addBehavior(lf, nb)))
    expect(parseBehaviors(s).behaviors.find(b => b.label === 'hml')!.bindingCells).toBe(2)
    expect(removeBehavior(s, 'hml')).toBe(src)
    let t = setBehaviorProp(src, 'and_bspc', 'keep-mods', '<(MOD_LSFT)>')
    expect(stray(t)).toBe(false)
    t = setBehaviorProp(t, 'and_bspc', 'keep-mods', null)
    expect(t).toBe(src)
  })
})

describe('CRLF: west.yml and pointing templates, add → remove is exact', () => {
  const west = crlf(baseWest)
  for (const t of TEMPLATES) {
    test(`${t.id}: overlay, conf and west return to their original bytes`, () => {
      const values = Object.fromEntries(t.fields.map(f => [f.key, f.value]))
      const westBase = t.west ? west.replace(new RegExp(`[ \\t]*- name: ${t.west.project}\\r\\n(?:[ \\t]{6,}\\S.*\\r\\n)*`), '') : west
      const f0: RepoFiles = {
        overlayPath: '/x/o.overlay', overlay: crlf(baseOverlay),
        confPath: '/x/o.conf', conf: crlf(baseConf),
        westPath: '/x/west.yml', west: westBase,
      }
      const add = planAdd(t, values, t.id, f0)
      expect(stray(add.overlay.after)).toBe(false)
      expect(stray(add.conf.after)).toBe(false)
      if (t.west) { expect(add.west).not.toBeNull(); expect(stray(add.west!.after)).toBe(false) }
      const f1: RepoFiles = { ...f0, overlay: add.overlay.after, conf: add.conf.after, west: add.west ? add.west.after : f0.west }
      const rm = planRemove(t.id, f1)
      expect(rm.overlay.after).toBe(crlf(baseOverlay))
      expect(rm.conf.after).toBe(crlf(baseConf))
      if (t.west) expect(rm.west!.after).toBe(westBase)
    })
  }

  test('west add / remove on CRLF', () => {
    const out = westAddModule(west, 'petejohanson', 'https://github.com/petejohanson', 'cirque-input-module', 'main', 'cirque')
    expect(stray(out)).toBe(false)
    expect(out).toBe(crlf(westAddModule(baseWest, 'petejohanson', 'https://github.com/petejohanson', 'cirque-input-module', 'main', 'cirque')))
    expect(westAddModule(out, 'petejohanson', 'https://github.com/petejohanson', 'cirque-input-module', 'main', 'cirque')).toBe(out)
    expect(westRemoveModule(out, 'cirque')).toBe(west)
  })
})

describe('CRLF: Kconfig, QMK and overlay property edits', () => {
  test('zmkSleep setKey rewrites and appends with CRLF', () => {
    const conf = crlf('# a\nCONFIG_ZMK_SLEEP=n\nCONFIG_X=y\n')
    expect(readKey(conf, 'CONFIG_ZMK_SLEEP')).toBe('n')
    expect(setKey(conf, 'CONFIG_ZMK_SLEEP', 'y')).toBe(crlf('# a\nCONFIG_ZMK_SLEEP=y\nCONFIG_X=y\n'))
    const added = setKey(conf, 'CONFIG_ZMK_IDLE_SLEEP_TIMEOUT', '1000', 'note')
    expect(stray(added)).toBe(false)
    expect(added).toBe(crlf(setKey('# a\nCONFIG_ZMK_SLEEP=n\nCONFIG_X=y\n', 'CONFIG_ZMK_IDLE_SLEEP_TIMEOUT', '1000', 'note')))
  })

  test('QMK rules.mk and config.h keep CRLF', () => {
    const rules = crlf('FOO = 1\nPOINTING_DEVICE_ENABLE = no\n')
    const config = crlf('#pragma once\n#define POINTING_DEVICE_ROTATION_90\n')
    const before = parseQmkPointing(rules, config)
    expect(before.rotation).toBe(90)
    expect(before.enabled).toBe(false)
    expect(setMkVar(rules, 'POINTING_DEVICE_ENABLE', 'yes')).toBe(crlf('FOO = 1\nPOINTING_DEVICE_ENABLE = yes\n'))
    expect(setMkVar(rules, 'POINTING_DEVICE_ENABLE', null)).toBe(crlf('FOO = 1\n'))
    expect(setDefine(config, 'POINTING_DEVICE_INVERT_X', '')).toBe(crlf('#pragma once\n#define POINTING_DEVICE_ROTATION_90\n#define POINTING_DEVICE_INVERT_X\n'))
    const out = applyQmkPointing(rules, config, before, { ...before, enabled: true, rotation: 180, invertY: true, cpi: 800 })
    expect(stray(out.rules)).toBe(false)
    expect(stray(out.config)).toBe(false)
    expect(out.config).toContain('#define POINTING_DEVICE_ROTATION_180\r\n')
  })

  test('QMK combos in keymap.c keep CRLF', () => {
    const lf = 'const uint16_t PROGMEM combo_enter[] = {KC_K, KC_L, COMBO_END};\nenum combos {\n    COMBO_ENTER,\n    COMBO_LENGTH\n};\nuint16_t COMBO_LEN = COMBO_LENGTH;\ncombo_t key_combos[COMBO_LENGTH] = {\n    [COMBO_ENTER]    = COMBO(combo_enter, KC_ENT),\n};\n'
    const src = crlf(lf)
    const combos = parseQMKCombos(src)
    expect(combos).toEqual(parseQMKCombos(lf))
    expect(updateQMKCombosInSource(src, combos)).toBe(src)
    const more = [...combos, { name: 'combo_esc', enumName: 'COMBO_ESC', fromKeys: ['KC_W', 'KC_E'], toKey: 'KC_ESC' }]
    const out = updateQMKCombosInSource(src, more)
    expect(stray(out)).toBe(false)
    expect(out).toBe(crlf(updateQMKCombosInSource(lf, more)))
  })

  test('overlay property setters keep CRLF', () => {
    const lf = '#include <behaviors.dtsi>\n&sensor {\n    status = "okay";\n    flip-x;\n};\n&listener {\n    input-processors = <&zip_xy_scaler 1 2>;\n};\n'
    const src = crlf(lf)
    const node = findNode(src, /&sensor\s*\{/)!
    const removed = setBoolProp(src, node, 'flip-x', false)
    expect(removed).toBe(crlf('#include <behaviors.dtsi>\n&sensor {\n    status = "okay";\n};\n&listener {\n    input-processors = <&zip_xy_scaler 1 2>;\n};\n'))
    const added = setBoolProp(removed, findNode(removed, /&sensor\s*\{/)!, 'flip-y', true)
    expect(stray(added)).toBe(false)
    expect(added).toBe(crlf(setBoolProp(lf.replace('    flip-x;\n', ''), findNode(lf.replace('    flip-x;\n', ''), /&sensor\s*\{/)!, 'flip-y', true)))
    const num = setIntProp(src, node, 'res-cpi', 800)
    expect(stray(num)).toBe(false)
    const snipe = setSnipe(src, /&listener\s*\{/, { layer: 2, divisor: 4 })
    expect(stray(snipe)).toBe(false)
    expect(snipe).toBe(crlf(setSnipe(lf, /&listener\s*\{/, { layer: 2, divisor: 4 })))
    expect(setSnipe(snipe, /&listener\s*\{/, null)).toBe(crlf(setSnipe(lf, /&listener\s*\{/, { layer: 2, divisor: 4 })).replace(/\r\n        snipe \{[\s\S]*?\};/, ''))
  })
})

describe('CRLF: read-only parsers', () => {
  test('build.yaml block lists and compat report read CRLF like LF', () => {
    const yaml = 'include:\n  - board: nice_nano_v2\n    shield:\n      - corne_left\n      - nice_view\n  - board: nice_nano_v2\n    shield: corne_right\n'
    expect(parseBuildTargets(crlf(yaml))).toEqual(parseBuildTargets(yaml))
    const km = fx('corpus', 'corne.keymap')
    expect(checkZmkCompatibility(crlf(km))).toEqual(checkZmkCompatibility(km))
  })
})
