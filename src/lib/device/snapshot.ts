/**
 * Full-keymap snapshots taken before any device write, so the UI can show
 * what was on the keyboard and detect drift (compare hashes before writing).
 */
import type { HidHandle } from './bridge'
import { definitionLayout, parseDefinition, type KeyboardDefinition } from './definition'
import { readRawKeymap, type StudioSession } from './studio'
import { readDynamicKeymap, viaHandshake } from './via'
import { vialHandshake } from './vial'

export type SnapshotTarget =
  | { kind: 'zmk-studio'; session: StudioSession }
  | { kind: 'via'; handle: HidHandle; definition: KeyboardDefinition | string }
  | { kind: 'vial'; handle: HidHandle; definition: KeyboardDefinition | string }

export interface DeviceSnapshot {
  kind: SnapshotTarget['kind']
  takenAt: string
  /** VIA/Vial: matrix[layer][row][col] keycodes. */
  matrix?: number[][][]
  /** Studio: every layer with [behaviorId, param1, param2] per key position. */
  studioLayers?: Array<{ id: number; name: string; bindings: Array<[number, number, number]> }>
  /** SHA-256 (hex) of the keymap content (not of takenAt). */
  hash: string
}

/** Stable SHA-256 hex over JSON of `value` (arrays / plain objects of numbers + strings). */
export async function hashKeymap(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

/** Read the complete keymap (all layers, every matrix position) and hash it. */
export async function snapshotDevice(target: SnapshotTarget): Promise<DeviceSnapshot> {
  const takenAt = new Date().toISOString()
  if (target.kind === 'zmk-studio') {
    const studioLayers = await readRawKeymap(target.session)
    return { kind: target.kind, takenAt, studioLayers, hash: await hashKeymap({ kind: target.kind, studioLayers }) }
  }
  const def = parseDefinition(target.definition)
  const { rows, cols } = definitionLayout(def)
  if (target.kind === 'via') await viaHandshake(target.handle)
  else await vialHandshake(target.handle)
  const { matrix } = await readDynamicKeymap(target.handle, rows, cols)
  return { kind: target.kind, takenAt, matrix, hash: await hashKeymap({ kind: target.kind, matrix }) }
}
