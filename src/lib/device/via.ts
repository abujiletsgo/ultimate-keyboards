/**
 * VIA raw-HID protocol client (qmk_firmware quantum/via.h, protocol 0x000C+).
 *
 * Every message is one 32-byte report; the reply echoes the command byte, or
 * 0xFF (id_unhandled) when the firmware does not know it. Multi-byte values
 * are big-endian. The pure encode/decode helpers are exported for tests.
 *
 * UNVERIFIED ON HARDWARE: no VIA keyboard was available while writing this;
 * byte layouts follow via.h / the VIA app's keyboard-api.ts.
 */
import type { HidHandle } from './bridge'
import { definitionLayout, parseDefinition, type DefinitionLayout, type KeyboardDefinition } from './definition'
import { qmkKeycode, type QmkKeycode } from './keycodes'

export const VIA_CMD = {
  GET_PROTOCOL_VERSION: 0x01,
  GET_KEYBOARD_VALUE: 0x02,
  SET_KEYBOARD_VALUE: 0x03,
  DYNAMIC_KEYMAP_GET_KEYCODE: 0x04,
  DYNAMIC_KEYMAP_SET_KEYCODE: 0x05,
  CUSTOM_SET_VALUE: 0x07, // formerly id_lighting_set_value
  CUSTOM_GET_VALUE: 0x08, // formerly id_lighting_get_value
  CUSTOM_SAVE: 0x09, // formerly id_lighting_save
  DYNAMIC_KEYMAP_GET_LAYER_COUNT: 0x11,
  DYNAMIC_KEYMAP_GET_BUFFER: 0x12,
  UNHANDLED: 0xff,
} as const

/** Custom-value channels (via.h `via_channel_id`). */
export const VIA_CHANNEL = { backlight: 1, rgblight: 2, rgb_matrix: 3, audio: 4, led_matrix: 5 } as const
export type ViaLightingChannel = 'backlight' | 'rgblight' | 'rgb_matrix' | 'led_matrix'

/** Value ids shared by the rgblight / rgb_matrix / led_matrix channels. */
export const VIA_LIGHT_VALUE = { brightness: 1, effect: 2, speed: 3, color: 4 } as const

/** Largest keymap chunk per get_buffer request: 32 − 4 header bytes. */
export const VIA_BUFFER_CHUNK = 28

// ── Pure encoders / decoders ────────────────────────────────────────────────

export const encodeGetProtocolVersion = (): number[] => [VIA_CMD.GET_PROTOCOL_VERSION]
export const encodeGetLayerCount = (): number[] => [VIA_CMD.DYNAMIC_KEYMAP_GET_LAYER_COUNT]

export function encodeGetBuffer(offset: number, size: number): number[] {
  if (size < 1 || size > VIA_BUFFER_CHUNK) throw new Error(`get_buffer size must be 1..${VIA_BUFFER_CHUNK}`)
  return [VIA_CMD.DYNAMIC_KEYMAP_GET_BUFFER, (offset >> 8) & 0xff, offset & 0xff, size]
}

export function encodeGetKeycode(layer: number, row: number, col: number): number[] {
  return [VIA_CMD.DYNAMIC_KEYMAP_GET_KEYCODE, layer, row, col]
}

export function encodeSetKeycode(layer: number, row: number, col: number, keycode: number): number[] {
  return [VIA_CMD.DYNAMIC_KEYMAP_SET_KEYCODE, layer, row, col, (keycode >> 8) & 0xff, keycode & 0xff]
}

export function encodeCustomGet(channel: number, valueId: number): number[] {
  return [VIA_CMD.CUSTOM_GET_VALUE, channel, valueId]
}

export function encodeCustomSet(channel: number, valueId: number, data: number[]): number[] {
  return [VIA_CMD.CUSTOM_SET_VALUE, channel, valueId, ...data.map(b => b & 0xff)]
}

export function encodeCustomSave(channel: number): number[] {
  return [VIA_CMD.CUSTOM_SAVE, channel]
}

/** Throw with a clear message unless `reply` answers `cmd`. */
export function checkReply(reply: ArrayLike<number>, cmd: number): void {
  if (reply.length === 0) throw new Error('empty reply from the keyboard')
  if (reply[0] === VIA_CMD.UNHANDLED && cmd !== VIA_CMD.UNHANDLED) {
    throw new Error(`the keyboard does not support VIA command 0x${cmd.toString(16).padStart(2, '0')}`)
  }
  if (reply[0] !== cmd) throw new Error(`unexpected reply 0x${reply[0].toString(16)} to VIA command 0x${cmd.toString(16)}`)
}

export function decodeProtocolVersion(reply: ArrayLike<number>): number {
  checkReply(reply, VIA_CMD.GET_PROTOCOL_VERSION)
  return (reply[1] << 8) | reply[2]
}

export function decodeLayerCount(reply: ArrayLike<number>): number {
  checkReply(reply, VIA_CMD.DYNAMIC_KEYMAP_GET_LAYER_COUNT)
  return reply[1]
}

/** Payload bytes of a get_buffer reply (after the 4-byte echo header). */
export function decodeBufferReply(reply: ArrayLike<number>, offset: number, size: number): number[] {
  checkReply(reply, VIA_CMD.DYNAMIC_KEYMAP_GET_BUFFER)
  const got = (reply[1] << 8) | reply[2]
  if (got !== (offset & 0xffff)) throw new Error(`get_buffer reply for offset ${got}, expected ${offset}`)
  if (reply.length < 4 + size) throw new Error('short get_buffer reply')
  return Array.from({ length: size }, (_, i) => reply[4 + i])
}

export function decodeKeycodeReply(reply: ArrayLike<number>): number {
  checkReply(reply, VIA_CMD.DYNAMIC_KEYMAP_GET_KEYCODE)
  return (reply[4] << 8) | reply[5]
}

/**
 * Split the dynamic keymap byte buffer (layers × rows × cols × u16 BE) into
 * matrix[layer][row][col].
 */
export function decodeKeymapBuffer(bytes: ArrayLike<number>, layers: number, rows: number, cols: number): number[][][] {
  const need = layers * rows * cols * 2
  if (bytes.length < need) throw new Error(`keymap buffer has ${bytes.length} bytes, need ${need}`)
  const out: number[][][] = []
  let i = 0
  for (let l = 0; l < layers; l++) {
    const layer: number[][] = []
    for (let r = 0; r < rows; r++) {
      const row: number[] = []
      for (let c = 0; c < cols; c++) { row.push((bytes[i] << 8) | bytes[i + 1]); i += 2 }
      layer.push(row)
    }
    out.push(layer)
  }
  return out
}

/** (offset, size) chunks covering `total` bytes. */
export function bufferChunks(total: number, chunk = VIA_BUFFER_CHUNK): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let off = 0; off < total; off += chunk) out.push([off, Math.min(chunk, total - off)])
  return out
}

// ── Shared raw-HID keymap codec (used by the VIA and Vial adapters) ────────

export interface WriteOptions {
  /**
   * VIA/Vial writes have never run against real hardware here, so every write
   * throws unless the caller opts in explicitly.
   */
  experimental?: boolean
}

export const EXPERIMENTAL_WRITE_ERROR =
  'Writing to VIA/Vial keyboards is experimental and untested on hardware; pass { experimental: true } to allow it.'

export function requireExperimental(opts: WriteOptions | undefined): void {
  if (!opts?.experimental) throw new Error(EXPERIMENTAL_WRITE_ERROR)
}

/**
 * Read the full dynamic keymap: layer count, then the byte buffer in 28-byte
 * chunks. No protocol-version gate: each adapter checks its own first.
 */
export async function readDynamicKeymap(h: HidHandle, rows: number, cols: number): Promise<{ layerCount: number; matrix: number[][][] }> {
  const layerCount = decodeLayerCount(await h.transact(encodeGetLayerCount()))
  if (layerCount < 1 || layerCount > 32) throw new Error(`keyboard reports ${layerCount} layers`)
  const total = layerCount * rows * cols * 2
  if (total > 0xffff) throw new Error('keymap is larger than the protocol can address')
  const bytes: number[] = []
  for (const [off, size] of bufferChunks(total)) {
    bytes.push(...decodeBufferReply(await h.transact(encodeGetBuffer(off, size)), off, size))
  }
  return { layerCount, matrix: decodeKeymapBuffer(bytes, layerCount, rows, cols) }
}

export async function getKeycode(h: HidHandle, layer: number, row: number, col: number): Promise<number> {
  return decodeKeycodeReply(await h.transact(encodeGetKeycode(layer, row, col)))
}

/** set_keycode, then get_keycode; throws if the keyboard does not hold the new value. */
export async function writeKeycodeVerified(h: HidHandle, layer: number, row: number, col: number, keycode: number): Promise<void> {
  checkReply(await h.transact(encodeSetKeycode(layer, row, col, keycode)), VIA_CMD.DYNAMIC_KEYMAP_SET_KEYCODE)
  const back = await getKeycode(h, layer, row, col)
  if (back !== (keycode & 0xffff)) {
    throw new Error(`Read-back mismatch at layer ${layer} (${row},${col}): wrote 0x${keycode.toString(16)}, keyboard has 0x${back.toString(16)}`)
  }
}

// ── VIA adapter ─────────────────────────────────────────────────────────────

/**
 * VIA protocol versions this adapter accepts: 0x000C (QMK 0.19+, keycodes
 * v0.0.x) and 0x000D. Older ones use a different keycode layout and are
 * refused rather than half-supported. (Vial boards report 0x0009 here and go
 * through the Vial adapter instead.)
 */
export const VIA_SUPPORTED_PROTOCOLS: readonly number[] = [0x000c, 0x000d]

export async function getProtocolVersion(h: HidHandle): Promise<number> {
  return decodeProtocolVersion(await h.transact(encodeGetProtocolVersion()))
}

/** Handshake: returns the protocol version, or throws when it is not supported. */
export async function viaHandshake(h: HidHandle): Promise<number> {
  const v = await getProtocolVersion(h)
  if (!VIA_SUPPORTED_PROTOCOLS.includes(v)) {
    throw new Error(`VIA protocol 0x${v.toString(16).padStart(4, '0')} is not supported (need 0x000C or 0x000D)`)
  }
  return v
}

export interface ViaKeymapRead {
  protocolVersion: number
  layerCount: number
  rows: number
  cols: number
  /** matrix[layer][row][col] raw 16-bit keycodes. */
  matrix: number[][][]
  /** layers[layer][layoutKeyIndex] keycodes in layout key order. */
  layers: number[][]
  labels: QmkKeycode[][]
  definitionLayout: DefinitionLayout
}

/** Keymap arrays in layout order + labels, from a raw matrix read. */
export function keymapFromMatrix(matrix: number[][][], dl: DefinitionLayout): Pick<ViaKeymapRead, 'layers' | 'labels'> {
  const layers = matrix.map(m => dl.matrix.map(p => m[p.row][p.col]))
  return { layers, labels: layers.map(l => l.map(qmkKeycode)) }
}

/** Read the whole dynamic keymap of a VIA keyboard. `def` is its VIA definition. */
export async function readVia(h: HidHandle, def: KeyboardDefinition | string): Promise<ViaKeymapRead> {
  const d = parseDefinition(def)
  const dl = definitionLayout(d)
  const protocolVersion = await viaHandshake(h)
  const { layerCount, matrix } = await readDynamicKeymap(h, dl.rows, dl.cols)
  return { protocolVersion, layerCount, rows: dl.rows, cols: dl.cols, matrix, ...keymapFromMatrix(matrix, dl), definitionLayout: dl }
}

/**
 * Write one keycode live (VIA persists to EEPROM immediately), then read it
 * back. Experimental: throws unless `{ experimental: true }`.
 */
export async function setKeycode(h: HidHandle, layer: number, row: number, col: number, keycode: number, opts?: WriteOptions): Promise<void> {
  requireExperimental(opts)
  await viaHandshake(h)
  await writeKeycodeVerified(h, layer, row, col, keycode)
}

// ── VIA lighting ────────────────────────────────────────────────────────────

export interface LightingState {
  brightness: number
  effect: number
  /** Absent on the backlight channel. */
  speed?: number
  hue?: number
  sat?: number
}

async function customGet(h: HidHandle, channel: number, valueId: number, n: number): Promise<number[]> {
  const r = await h.transact(encodeCustomGet(channel, valueId))
  checkReply(r, VIA_CMD.CUSTOM_GET_VALUE)
  if (r[1] !== channel || r[2] !== valueId) throw new Error('lighting reply for a different value')
  return Array.from(r.slice(3, 3 + n))
}

export async function getLighting(h: HidHandle, channel: ViaLightingChannel): Promise<LightingState> {
  const ch = VIA_CHANNEL[channel]
  const [brightness] = await customGet(h, ch, VIA_LIGHT_VALUE.brightness, 1)
  const [effect] = await customGet(h, ch, VIA_LIGHT_VALUE.effect, 1)
  if (channel === 'backlight') return { brightness, effect }
  const [speed] = await customGet(h, ch, VIA_LIGHT_VALUE.speed, 1)
  if (channel === 'led_matrix') return { brightness, effect, speed }
  const [hue, sat] = await customGet(h, ch, VIA_LIGHT_VALUE.color, 2)
  return { brightness, effect, speed, hue, sat }
}

/**
 * Apply lighting values live, then read them back (throws on mismatch);
 * call saveLighting to persist. Experimental: needs `{ experimental: true }`.
 */
export async function setLighting(h: HidHandle, channel: ViaLightingChannel, patch: Partial<LightingState>, opts?: WriteOptions): Promise<LightingState> {
  requireExperimental(opts)
  const ch = VIA_CHANNEL[channel]
  const send = async (id: number, data: number[]) =>
    checkReply(await h.transact(encodeCustomSet(ch, id, data)), VIA_CMD.CUSTOM_SET_VALUE)
  const before = await getLighting(h, channel)
  const want: LightingState = { ...before, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }
  if (patch.brightness !== undefined) await send(VIA_LIGHT_VALUE.brightness, [want.brightness])
  if (patch.effect !== undefined) await send(VIA_LIGHT_VALUE.effect, [want.effect])
  if (patch.speed !== undefined) await send(VIA_LIGHT_VALUE.speed, [want.speed ?? 0])
  if (patch.hue !== undefined || patch.sat !== undefined) await send(VIA_LIGHT_VALUE.color, [want.hue ?? 0, want.sat ?? 0])
  const after = await getLighting(h, channel)
  for (const k of Object.keys(patch) as Array<keyof LightingState>) {
    if (patch[k] !== undefined && after[k] !== want[k]) throw new Error(`Read-back mismatch for lighting ${k}: wrote ${want[k]}, keyboard has ${after[k]}`)
  }
  return after
}

/** Persist lighting to EEPROM. Experimental: needs `{ experimental: true }`. */
export async function saveLighting(h: HidHandle, channel: ViaLightingChannel, opts?: WriteOptions): Promise<void> {
  requireExperimental(opts)
  checkReply(await h.transact(encodeCustomSave(VIA_CHANNEL[channel])), VIA_CMD.CUSTOM_SAVE)
}

// ── Definitions (fetched at runtime, never bundled: the-via/keyboards is GPL-3) ─

/** VIA's vendor/product id: vid * 65536 + pid (unsigned). */
export function viaVpid(vid: number, pid: number): number {
  return (vid & 0xffff) * 65536 + (pid & 0xffff)
}

export function hexId(vid: number, pid: number): string {
  return `${vid.toString(16).padStart(4, '0')}:${pid.toString(16).padStart(4, '0')}`
}
