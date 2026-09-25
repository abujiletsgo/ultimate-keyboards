/**
 * Vial adapter (vial-qmk quantum/vial.c; protocol implemented here, the GPL
 * Vial GUI is not used). Separate from the VIA adapter: its own handshake and
 * version gate (Vial boards report VIA protocol 0x0009, which the VIA adapter
 * refuses). It shares the raw-HID transport and the dynamic-keymap wire codec
 * in via.ts, because Vial firmware answers the same keymap commands.
 * Vial keyboards carry their own definition: the xz-compressed vial.json is
 * read over raw HID by the Rust `vial_definition` command.
 *
 * Commands (prefix 0xFE): 0x00 get_keyboard_id → vial protocol u32 LE +
 * keyboard uid (8 bytes); 0x01 get_size; 0x02 get_def (Rust side).
 * VialRGB (vial-qmk quantum/vialrgb.c) reuses the lighting get/set commands
 * with sub-ids 0x40 info, 0x41 mode.
 *
 * UNVERIFIED ON HARDWARE: no Vial keyboard was available.
 */
import { readVialDefinitionText, type HidHandle } from './bridge'
import { definitionLayout, lightingKind, parseDefinition, type DefinitionLayout, type KeyboardDefinition, type LightingKind } from './definition'
import {
  checkReply, keymapFromMatrix, readDynamicKeymap, requireExperimental, VIA_CMD, writeKeycodeVerified,
  type ViaKeymapRead, type WriteOptions,
} from './via'

export const VIAL_PREFIX = 0xfe
export const VIAL_GET_KEYBOARD_ID = 0x00
export const VIALRGB = { GET_INFO: 0x40, MODE: 0x41 } as const
/**
 * Vial protocol versions accepted (vial-qmk VIAL_PROTOCOL_VERSION 6 = QMK
 * keycodes v0.0.x). Others are refused rather than half-supported.
 */
export const VIAL_SUPPORTED_PROTOCOLS: readonly number[] = [6]

export interface VialKeyboardId {
  protocol: number
  uid: string
}

export function encodeGetKeyboardId(): number[] {
  return [VIAL_PREFIX, VIAL_GET_KEYBOARD_ID]
}

export function decodeKeyboardId(reply: ArrayLike<number>): VialKeyboardId {
  if (reply.length < 12) throw new Error('short reply to Vial get_keyboard_id')
  const protocol = (reply[0] | (reply[1] << 8) | (reply[2] << 16) | (reply[3] << 24)) >>> 0
  const uid = Array.from({ length: 8 }, (_, i) => reply[4 + i].toString(16).padStart(2, '0')).join('')
  return { protocol, uid }
}

/** Handshake: get_keyboard_id; throws unless the Vial protocol is supported. */
export async function vialHandshake(h: HidHandle): Promise<VialKeyboardId> {
  const id = decodeKeyboardId(await h.transact(encodeGetKeyboardId()))
  if (!VIAL_SUPPORTED_PROTOCOLS.includes(id.protocol)) {
    throw new Error(`Vial protocol ${id.protocol} is not supported (need ${VIAL_SUPPORTED_PROTOCOLS.join(', ')})`)
  }
  return id
}

/** vial.json text → definition + PhysicalLayout + matrix mapping. */
export function parseVialJson(json: string | unknown, fallbackName?: string): { definition: KeyboardDefinition } & DefinitionLayout {
  const definition = parseDefinition(json)
  const dl = definitionLayout(definition, definition.name ?? fallbackName ?? 'Vial keyboard', 'vial')
  return { definition, ...dl }
}

export interface VialRead {
  name: string
  keyboardId: VialKeyboardId
  definition: KeyboardDefinition
  lighting: LightingKind
  /** protocolVersion here is the Vial protocol, not VIA's. */
  keymap: ViaKeymapRead
}

export interface ReadVialOptions {
  /** Name to use when vial.json has none (e.g. the USB product string). */
  fallbackName?: string
  /** Where vial.json comes from; default is the Rust `vial_definition` command. */
  loadDefinition?: (h: HidHandle) => Promise<string>
}

/** Handshake, then read definition and the complete keymap from an open Vial handle. */
export async function readVial(h: HidHandle, opts: ReadVialOptions = {}): Promise<VialRead> {
  const { fallbackName, loadDefinition = readVialDefinitionText } = opts
  const keyboardId = await vialHandshake(h)
  const text = await loadDefinition(h)
  const { definition, ...dl } = parseVialJson(text, fallbackName)
  const { layerCount, matrix } = await readDynamicKeymap(h, dl.rows, dl.cols)
  return {
    name: definition.name ?? fallbackName ?? 'Vial keyboard',
    keyboardId,
    definition,
    lighting: lightingKind(definition),
    keymap: {
      protocolVersion: keyboardId.protocol,
      layerCount,
      rows: dl.rows,
      cols: dl.cols,
      matrix,
      ...keymapFromMatrix(matrix, dl),
      definitionLayout: dl,
    },
  }
}

/**
 * Write one keycode live and read it back. Experimental: throws unless
 * `{ experimental: true }` (never run against a Vial keyboard here).
 */
export async function setVialKeycode(h: HidHandle, layer: number, row: number, col: number, keycode: number, opts?: WriteOptions): Promise<void> {
  requireExperimental(opts)
  await vialHandshake(h)
  await writeKeycodeVerified(h, layer, row, col, keycode)
}

// ── VialRGB ─────────────────────────────────────────────────────────────────

export interface VialRgbState { mode: number; speed: number; hue: number; sat: number; val: number }

export function decodeVialRgbMode(reply: ArrayLike<number>): VialRgbState {
  checkReply(reply, VIA_CMD.CUSTOM_GET_VALUE)
  if (reply[1] !== VIALRGB.MODE) throw new Error('unexpected VialRGB reply')
  return { mode: reply[2] | (reply[3] << 8), speed: reply[4], hue: reply[5], sat: reply[6], val: reply[7] }
}

export function encodeVialRgbSet(s: VialRgbState): number[] {
  return [VIA_CMD.CUSTOM_SET_VALUE, VIALRGB.MODE, s.mode & 0xff, (s.mode >> 8) & 0xff, s.speed, s.hue, s.sat, s.val]
}

export async function getVialRgb(h: HidHandle): Promise<VialRgbState> {
  return decodeVialRgbMode(await h.transact([VIA_CMD.CUSTOM_GET_VALUE, VIALRGB.MODE]))
}

/** Set VialRGB mode/colour and read it back. Experimental: needs `{ experimental: true }`. */
export async function setVialRgb(h: HidHandle, s: VialRgbState, opts?: WriteOptions): Promise<VialRgbState> {
  requireExperimental(opts)
  checkReply(await h.transact(encodeVialRgbSet(s)), VIA_CMD.CUSTOM_SET_VALUE)
  const back = await getVialRgb(h)
  for (const k of Object.keys(s) as Array<keyof VialRgbState>) {
    if (back[k] !== s[k]) throw new Error(`Read-back mismatch for VialRGB ${k}: wrote ${s[k]}, keyboard has ${back[k]}`)
  }
  return back
}

/** Persist VialRGB to EEPROM. Experimental: needs `{ experimental: true }`. */
export async function saveVialRgb(h: HidHandle, opts?: WriteOptions): Promise<void> {
  requireExperimental(opts)
  checkReply(await h.transact([VIA_CMD.CUSTOM_SAVE]), VIA_CMD.CUSTOM_SAVE)
}
