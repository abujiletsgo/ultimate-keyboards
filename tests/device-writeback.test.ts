import { describe, expect, test } from 'bun:test'
import { FakeRawHid } from './helpers/fakeRawHid'
import { qmkKeycode } from '../src/lib/device/keycodes'
import { EXPERIMENTAL_WRITE_ERROR } from '../src/lib/device/via'
import {
  keymapJsonLayers, planKeymapWrite, previewKeymapWrite, shapeError, writeKeymapToDevice,
  WriteFailed, WriteRefused, type DeviceLink,
} from '../src/lib/device/writeBack'

// 2 rows × 3 cols, 2 layers; layout order 0,0 0,1 0,2 1,0 1,2 (matrix 1,1 has no key)
const DEF = {
  name: 'Tiny', vendorId: '0x1234', productId: '0x5678', matrix: { rows: 2, cols: 3 },
  layouts: { keymap: [['0,0', '0,1', '0,2'], [{ x: 0.5 }, '1,0', { w: 2 }, '1,2']] },
}
const MATRIX = () => [
  [[0x0004, 0x0005, 0x0006], [0x0029, 0x0777, 0x002c]],
  [[0x0001, 0x5221, 0x412c], [0x0000, 0x0000, 0x00e1]],
]
const LINK: DeviceLink = { protocol: 'via', vid: 0x1234, pid: 0x5678, definition: DEF }
const POS = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 2 }]

/** What Plugged in saves: names in layout order, exactly as the reader decodes them. */
const asRead = (m: number[][][]) => m.map(l => POS.map(p => qmkKeycode(l[p.row][p.col]).name))

const deps = (log: string[] = []) => ({ saveBackup: async () => { log.push('backup'); return '/backups/tiny.json' } })

describe('planKeymapWrite', () => {
  test('a keymap read from the keyboard plans no writes (round trip of every name)', () => {
    const plan = planKeymapWrite(asRead(MATRIX()), MATRIX(), POS)
    expect(plan).toEqual({ writes: [], refused: [], unchanged: 10 })
  })

  test('only changed keys are planned, with their matrix position', () => {
    const layers = asRead(MATRIX())
    layers[0][4] = 'KC_ENT'
    layers[1][1] = 'MO(2)'
    const plan = planKeymapWrite(layers, MATRIX(), POS)
    expect(plan.writes).toEqual([
      { layer: 0, index: 4, row: 1, col: 2, from: 0x002c, to: 0x0028, name: 'KC_ENT' },
      { layer: 1, index: 1, row: 0, col: 1, from: 0x5221, to: 0x5222, name: 'MO(2)' },
    ])
    expect(plan.unchanged).toBe(8)
  })

  test('names that cannot be encoded exactly are refused, never guessed', () => {
    const layers = asRead(MATRIX())
    layers[0][0] = 'RESET'
    layers[1][2] = 'KC_NOT_A_KEY'
    expect(planKeymapWrite(layers, MATRIX(), POS).refused.map(r => r.name)).toEqual(['RESET', 'KC_NOT_A_KEY'])
  })

  test('shape errors: key count and layer count', () => {
    expect(shapeError([['KC_A']], 5, 2)).toContain('Layer 0 has 1 keys')
    expect(shapeError([[], [], []].map(() => Array(5).fill('KC_A')), 5, 2)).toContain('3 layers but the keyboard has 2')
    expect(shapeError([], 5, 2)).toContain('no layers')
    expect(shapeError([Array(5).fill('KC_A')], 5, 4)).toBeNull()
  })
})

describe('writeKeymapToDevice against a fake VIA keyboard', () => {
  test('needs { experimental: true }; nothing is sent otherwise', async () => {
    const hid = new FakeRawHid(MATRIX())
    await expect(writeKeymapToDevice(hid, LINK, asRead(MATRIX()), deps())).rejects.toThrow(EXPERIMENTAL_WRITE_ERROR)
    expect(hid.sent).toEqual([])
  })

  test('backs up first, writes only changed keys, verifies the whole keymap', async () => {
    const hid = new FakeRawHid(MATRIX())
    const layers = asRead(MATRIX())
    layers[0][0] = 'KC_Q'
    layers[1][4] = 'LSFT_T(KC_Z)'
    const log: string[] = []
    const progress: number[] = []
    const r = await writeKeymapToDevice(hid, LINK, layers, { ...deps(log), onProgress: d => progress.push(d) }, { experimental: true })
    expect(log).toEqual(['backup'])
    expect(r.written.map(w => [w.layer, w.row, w.col, w.to])).toEqual([[0, 0, 0, 0x0014], [1, 1, 2, 0x221d]])
    expect(progress).toEqual([1, 2])
    expect(r.backup.matrix).toEqual(MATRIX())
    expect(r.backupPath).toBe('/backups/tiny.json')
    // the matrix position with no layout key is untouched
    expect(hid.matrix[0][1][1]).toBe(0x0777)
    expect(hid.matrix[0][0][0]).toBe(0x0014)
    // exactly two set_keycode reports
    expect(hid.sent.filter(s => s[0] === 0x05).length).toBe(2)
  })

  test('nothing to change → no writes, still verified', async () => {
    const hid = new FakeRawHid(MATRIX())
    const r = await writeKeymapToDevice(hid, LINK, asRead(MATRIX()), deps(), { experimental: true })
    expect(r.written).toEqual([])
    expect(hid.sent.some(s => s[0] === 0x05)).toBe(false)
  })

  test('a refused name stops the write before the backup and before any key', async () => {
    const hid = new FakeRawHid(MATRIX())
    const layers = asRead(MATRIX())
    layers[0][1] = 'KC_Q'
    layers[0][2] = 'M(3)'
    const log: string[] = []
    const p = writeKeymapToDevice(hid, LINK, layers, deps(log), { experimental: true })
    await expect(p).rejects.toBeInstanceOf(WriteRefused)
    await expect(p).rejects.toThrow('1 key cannot be encoded exactly (layer 0 key 2: M(3))')
    expect(hid.sent.some(s => s[0] === 0x05)).toBe(false)
    expect(log).toEqual([])
  })

  test('wrong shape is refused', async () => {
    const hid = new FakeRawHid(MATRIX())
    await expect(writeKeymapToDevice(hid, LINK, [['KC_A']], deps(), { experimental: true })).rejects.toThrow('Layer 0 has 1 keys')
  })

  test('the keyboard changed since the user checked → refused', async () => {
    const hid = new FakeRawHid(MATRIX())
    const layers = asRead(MATRIX())
    layers[0][0] = 'KC_Q'
    const { plan } = await previewKeymapWrite(hid, LINK, layers)
    hid.matrix[0][0][0] = 0x0015 // someone changed the key in VIA meanwhile
    await expect(writeKeymapToDevice(hid, LINK, layers, { ...deps(), expect: plan }, { experimental: true })).rejects.toThrow('changed since you checked')
    expect(hid.matrix[0][0][0]).toBe(0x0015)
  })

  test('a key that does not stick stops the write and reports what was written', async () => {
    const hid = new FakeRawHid(MATRIX(), 0x000c, null, { ignoreWrites: true })
    const layers = asRead(MATRIX())
    layers[0][0] = 'KC_Q'
    const p = writeKeymapToDevice(hid, LINK, layers, deps(), { experimental: true })
    await expect(p).rejects.toBeInstanceOf(WriteFailed)
    await expect(p).rejects.toThrow('Stopped after 0 of 1 keys')
  })

  test('Vial keyboards use the Vial handshake', async () => {
    const hid = new FakeRawHid(MATRIX(), 0x0009, 6)
    const layers = asRead(MATRIX())
    layers[0][3] = 'KC_TAB'
    const r = await writeKeymapToDevice(hid, { ...LINK, protocol: 'vial' }, layers, deps(), { experimental: true })
    expect(r.written.length).toBe(1)
    expect(hid.matrix[0][1][0]).toBe(0x002b)
  })
})

test('keymapJsonLayers', () => {
  expect(keymapJsonLayers('{"layers":[["KC_A"]]}')).toEqual([['KC_A']])
  expect(() => keymapJsonLayers('{"layers":[[1]]}')).toThrow('no "layers"')
})
