import { describe, expect, test } from 'bun:test'
import { FakeRawHid } from './helpers/fakeRawHid'
import {
  bufferChunks, checkReply, decodeBufferReply, decodeKeymapBuffer, decodeLayerCount, decodeProtocolVersion,
  encodeCustomGet, encodeCustomSet, encodeGetBuffer, encodeSetKeycode, EXPERIMENTAL_WRITE_ERROR, getLighting,
  readVia, saveLighting, setKeycode, setLighting, viaHandshake, viaVpid,
} from '../src/lib/device/via'
import { snapshotDevice, hashKeymap } from '../src/lib/device/snapshot'

// 2 rows × 3 cols, 2 layers
const DEF = {
  name: 'Tiny',
  vendorId: '0x1234',
  productId: '0x5678',
  matrix: { rows: 2, cols: 3 },
  layouts: { keymap: [['0,0', '0,1', '0,2'], [{ x: 0.5 }, '1,0', { w: 2 }, '1,2']] },
}
const MATRIX = () => [
  [[0x0004, 0x0005, 0x0006], [0x0029, 0x0000, 0x002c]],
  [[0x0001, 0x5221, 0x412c], [0x0000, 0x0000, 0x00e1]],
]

describe('VIA encoders / decoders', () => {
  test('get_buffer request and reply', () => {
    expect(encodeGetBuffer(0x0123, 28)).toEqual([0x12, 0x01, 0x23, 28])
    expect(() => encodeGetBuffer(0, 29)).toThrow()
    const reply = [0x12, 0x00, 0x1c, 4, 0xaa, 0xbb, 0xcc, 0xdd, ...new Array(24).fill(0)]
    expect(decodeBufferReply(reply, 28, 4)).toEqual([0xaa, 0xbb, 0xcc, 0xdd])
    expect(() => decodeBufferReply(reply, 0, 4)).toThrow('offset')
  })

  test('keymap buffer is big-endian u16, layer-major then row then col', () => {
    const bytes = [0x00, 0x04, 0x51, 0x00, 0x7c, 0x00, 0x00, 0x2c]
    expect(decodeKeymapBuffer(bytes, 2, 1, 2)).toEqual([[[0x0004, 0x5100]], [[0x7c00, 0x002c]]])
    expect(() => decodeKeymapBuffer(bytes, 2, 2, 2)).toThrow('need 16')
  })

  test('chunks cover the buffer in ≤28-byte pieces', () => {
    expect(bufferChunks(60)).toEqual([[0, 28], [28, 28], [56, 4]])
    expect(bufferChunks(0)).toEqual([])
  })

  test('set_keycode, custom values, protocol, layer count, unhandled', () => {
    expect(encodeSetKeycode(1, 2, 3, 0x4105)).toEqual([0x05, 1, 2, 3, 0x41, 0x05])
    expect(encodeCustomGet(3, 1)).toEqual([0x08, 3, 1])
    expect(encodeCustomSet(3, 4, [300, 20])).toEqual([0x07, 3, 4, 300 & 0xff, 20])
    expect(decodeProtocolVersion([0x01, 0x00, 0x0c])).toBe(12)
    expect(decodeLayerCount([0x11, 4])).toBe(4)
    expect(() => checkReply([0xff], 0x12)).toThrow('does not support VIA command 0x12')
    expect(() => checkReply([0x05], 0x12)).toThrow('unexpected reply')
  })

  test('vpid = vid * 65536 + pid, unsigned', () => {
    expect(viaVpid(0x1234, 0x5678)).toBe(0x12345678)
    expect(viaVpid(0xfeed, 0x0001)).toBe(0xfeed0001)
  })
})

describe('VIA adapter against a fake keyboard', () => {
  test('readVia returns matrix, layout-order layers and labels', async () => {
    const hid = new FakeRawHid(MATRIX())
    const r = await readVia(hid, DEF)
    expect(r.layerCount).toBe(2)
    expect(r.matrix).toEqual(MATRIX())
    // layout order: 0,0 0,1 0,2 1,0 1,2 (matrix 1,1 has no key)
    expect(r.layers[0]).toEqual([0x0004, 0x0005, 0x0006, 0x0029, 0x002c])
    expect(r.labels[0].map(l => l.label)).toEqual(['A', 'B', 'C', 'ESC', 'SPC'])
    expect(r.labels[1][1]).toMatchObject({ name: 'MO(1)', label: 'L1', sub: 'hold' })
    expect(r.definitionLayout.layout.keys[4]).toMatchObject({ x: 1.5, y: 1, w: 2, row: 1, col: 2 })
    // 2 layers × 2 × 3 × 2 bytes = 24 → a single get_buffer request
    expect(hid.sent.filter(s => s[0] === 0x12).length).toBe(1)
  })

  test('unsupported protocol versions are refused', async () => {
    await expect(viaHandshake(new FakeRawHid(MATRIX(), 0x000b))).rejects.toThrow('VIA protocol 0x000b is not supported')
    await expect(readVia(new FakeRawHid(MATRIX(), 0x0009), DEF)).rejects.toThrow('not supported')
    expect(await viaHandshake(new FakeRawHid(MATRIX(), 0x000d))).toBe(13)
  })

  test('writes need { experimental: true } and are read back', async () => {
    const hid = new FakeRawHid(MATRIX())
    await expect(setKeycode(hid, 0, 0, 0, 0x0007)).rejects.toThrow(EXPERIMENTAL_WRITE_ERROR)
    expect(hid.sent.some(s => s[0] === 0x05)).toBe(false)
    await setKeycode(hid, 0, 0, 0, 0x0007, { experimental: true })
    expect(hid.matrix[0][0][0]).toBe(0x0007)

    const stuck = new FakeRawHid(MATRIX(), 0x000c, null, { ignoreWrites: true })
    await expect(setKeycode(stuck, 0, 0, 0, 0x0007, { experimental: true })).rejects.toThrow('Read-back mismatch')
  })

  test('rgb_matrix lighting get / experimental set with read-back / save', async () => {
    const hid = new FakeRawHid(MATRIX())
    expect(await getLighting(hid, 'rgb_matrix')).toEqual({ brightness: 120, effect: 4, speed: 128, hue: 10, sat: 255 })
    await expect(setLighting(hid, 'rgb_matrix', { brightness: 200 })).rejects.toThrow(EXPERIMENTAL_WRITE_ERROR)
    await expect(saveLighting(hid, 'rgb_matrix')).rejects.toThrow(EXPERIMENTAL_WRITE_ERROR)
    const after = await setLighting(hid, 'rgb_matrix', { brightness: 200, hue: 50 }, { experimental: true })
    expect(after).toMatchObject({ brightness: 200, hue: 50, sat: 255 })
    await saveLighting(hid, 'rgb_matrix', { experimental: true })
    expect(hid.sent.at(-1)).toEqual([0x09, 3])

    const stuck = new FakeRawHid(MATRIX(), 0x000c, null, { ignoreWrites: true })
    await expect(setLighting(stuck, 'rgb_matrix', { effect: 9 }, { experimental: true })).rejects.toThrow('Read-back mismatch')
  })

  test('snapshotDevice reads every layer and hashes content', async () => {
    const hid = new FakeRawHid(MATRIX())
    const a = await snapshotDevice({ kind: 'via', handle: hid, definition: DEF })
    expect(a.matrix).toEqual(MATRIX())
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
    const b = await snapshotDevice({ kind: 'via', handle: hid, definition: DEF })
    expect(b.hash).toBe(a.hash)
    await setKeycode(hid, 1, 1, 1, 0x0004, { experimental: true })
    expect((await snapshotDevice({ kind: 'via', handle: hid, definition: DEF })).hash).not.toBe(a.hash)
    expect(await hashKeymap([1, 2])).toBe(await hashKeymap([1, 2]))
  })
})
