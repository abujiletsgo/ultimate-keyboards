/**
 * Write an edited keymap back to a VIA or Vial keyboard.
 *
 * The keymap file (keymap.json saved from Plugged in) lists keycode names per
 * layer in the order of the keyboard definition's default layout. Writing:
 *   1. handshake and read the whole keymap from the keyboard (the backup),
 *   2. plan: encode every name; refuse the whole write if any name cannot be
 *      encoded exactly, or if the file and keyboard disagree on shape,
 *   3. write only the keys that differ, each read back (writeKeycodeVerified),
 *   4. read the whole keymap again and check every position.
 *
 * EXPERIMENTAL: never run against a real VIA or Vial keyboard here; every
 * call needs `{ experimental: true }`.
 */
import type { HidHandle } from './bridge'
import { definitionLayout, parseDefinition, type KeyboardDefinition } from './definition'
import { encodeQmkKeycode, qmkKeycode } from './keycodes'
import { snapshotDevice, type DeviceSnapshot } from './snapshot'
import { readDynamicKeymap, requireExperimental, writeKeycodeVerified, type WriteOptions } from './via'

/** Which USB keyboard a registry keyboard was read from, and how to talk to it. */
export interface DeviceLink {
  protocol: 'via' | 'vial'
  vid: number
  pid: number
  /** USB serial number, to tell two identical keyboards apart */
  serial?: string
  /** VIA definition or vial.json, cached when the keyboard was added */
  definition: KeyboardDefinition
}

export interface KeyWrite {
  layer: number
  /** key index in layout order */
  index: number
  row: number
  col: number
  from: number
  to: number
  /** keycode name as written in the file */
  name: string
}

export interface KeyRefusal { layer: number; index: number; name: string; reason: string }

export interface WritePlan {
  writes: KeyWrite[]
  refused: KeyRefusal[]
  /** keys already holding the file's value */
  unchanged: number
}

/** Shape problems that stop the whole write; null when the file fits the keyboard. */
export function shapeError(layers: string[][], keysPerLayer: number, deviceLayers: number): string | null {
  if (layers.length === 0) return 'The keymap file has no layers.'
  const bad = layers.findIndex(l => l.length !== keysPerLayer)
  if (bad >= 0) return `Layer ${bad} has ${layers[bad].length} keys but the keyboard's layout has ${keysPerLayer}. Read the keymap from the keyboard again and save a new file.`
  if (layers.length > deviceLayers) return `The file has ${layers.length} layers but the keyboard has ${deviceLayers}. Remove layers ${deviceLayers}–${layers.length - 1} first.`
  return null
}

/**
 * Diff the file against what is on the keyboard. `matrix[layer][row][col]`
 * comes from the keyboard; `positions[i]` is layout key i's matrix position.
 * Pure; never guesses a keycode.
 */
export function planKeymapWrite(layers: string[][], matrix: number[][][], positions: Array<{ row: number; col: number }>): WritePlan {
  const plan: WritePlan = { writes: [], refused: [], unchanged: 0 }
  layers.forEach((keys, layer) => {
    keys.forEach((name, index) => {
      const { row, col } = positions[index]
      const to = encodeQmkKeycode(name)
      if (to === null) {
        plan.refused.push({ layer, index, name, reason: 'not a keycode this app can write exactly' })
        return
      }
      const from = matrix[layer][row][col]
      if (from === to) plan.unchanged++
      else plan.writes.push({ layer, index, row, col, from, to, name })
    })
  })
  return plan
}

export class WriteRefused extends Error {
  constructor(message: string, public refused: KeyRefusal[] = []) { super(message) }
}

export interface WriteReport {
  plan: WritePlan
  /** keys written and read back, in order */
  written: KeyWrite[]
  backup: DeviceSnapshot
  backupPath: string
}

export interface WriteDeps {
  /** Persist the pre-write snapshot; returns where it went. Runs before any write. */
  saveBackup: (snap: DeviceSnapshot) => Promise<string>
  onProgress?: (done: number, total: number) => void
  /**
   * When set, the plan computed now must equal the one the user approved
   * (same keys, same values); the keyboard changed in between otherwise.
   */
  expect?: WritePlan
}

/** Read the keyboard and diff it against `layers` without writing. */
export async function previewKeymapWrite(h: HidHandle, link: DeviceLink, layers: string[][]): Promise<{ plan: WritePlan; snapshot: DeviceSnapshot; shape: string | null }> {
  const def = parseDefinition(link.definition)
  const dl = definitionLayout(def)
  const snapshot = await snapshotDevice({ kind: link.protocol, handle: h, definition: def })
  const matrix = snapshot.matrix!
  const shape = shapeError(layers, dl.matrix.length, matrix.length)
  return { plan: shape ? { writes: [], refused: [], unchanged: 0 } : planKeymapWrite(layers, matrix, dl.matrix), snapshot, shape }
}

const samePlan = (a: WritePlan, b: WritePlan) =>
  a.writes.length === b.writes.length && a.writes.every((w, i) => {
    const o = b.writes[i]
    return o.layer === w.layer && o.index === w.index && o.from === w.from && o.to === w.to
  })

export async function writeKeymapToDevice(h: HidHandle, link: DeviceLink, layers: string[][], deps: WriteDeps, opts?: WriteOptions): Promise<WriteReport> {
  requireExperimental(opts)
  const def = parseDefinition(link.definition)
  const dl = definitionLayout(def)
  const { plan, snapshot, shape } = await previewKeymapWrite(h, link, layers)
  if (shape) throw new WriteRefused(shape)
  if (plan.refused.length) {
    const list = plan.refused.slice(0, 5).map(r => `layer ${r.layer} key ${r.index}: ${r.name}`).join('; ')
    throw new WriteRefused(`Nothing was written: ${plan.refused.length} key${plan.refused.length === 1 ? '' : 's'} cannot be encoded exactly (${list}${plan.refused.length > 5 ? '; …' : ''}).`, plan.refused)
  }
  if (deps.expect && !samePlan(plan, deps.expect)) {
    throw new WriteRefused('Nothing was written: the keyboard changed since you checked. Check again to see the current changes.')
  }
  const backupPath = await deps.saveBackup(snapshot)

  const written: KeyWrite[] = []
  for (const w of plan.writes) {
    try {
      await writeKeycodeVerified(h, w.layer, w.row, w.col, w.to)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new WriteFailed(`Stopped after ${written.length} of ${plan.writes.length} keys: ${msg}. The backup from before writing is ${backupPath}.`, written, backupPath)
    }
    written.push(w)
    deps.onProgress?.(written.length, plan.writes.length)
  }

  // read everything back: written keys hold the new value, every other position its old one
  const { matrix: after } = await readDynamicKeymap(h, dl.rows, dl.cols)
  const want = snapshot.matrix!.map(l => l.map(r => [...r]))
  for (const w of written) want[w.layer][w.row][w.col] = w.to
  for (let l = 0; l < want.length; l++) for (let r = 0; r < dl.rows; r++) for (let c = 0; c < dl.cols; c++) {
    if (after[l]?.[r]?.[c] !== want[l][r][c]) {
      throw new WriteFailed(`Keys were written, but layer ${l} (${r},${c}) reads ${qmkKeycode(after[l]?.[r]?.[c] ?? 0).name} instead of ${qmkKeycode(want[l][r][c]).name}. The backup from before writing is ${backupPath}.`, written, backupPath)
    }
  }
  return { plan, written, backup: snapshot, backupPath }
}

export class WriteFailed extends Error {
  constructor(message: string, public written: KeyWrite[], public backupPath: string) { super(message) }
}

/** Layers of a keymap JSON (keymap.json or VIA export) as keycode names. */
export function keymapJsonLayers(text: string): string[][] {
  const doc = JSON.parse(text) as { layers?: unknown }
  if (!Array.isArray(doc.layers) || !doc.layers.every(l => Array.isArray(l) && l.every(k => typeof k === 'string'))) {
    throw new Error('The keymap file has no "layers" list of keycode names.')
  }
  return doc.layers as string[][]
}
