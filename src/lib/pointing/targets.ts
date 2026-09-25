/**
 * Where a pointing-device template writes for a given keyboard: the shield
 * overlay for the half that carries the sensor, that half's .conf, and the
 * repo's config/west.yml. Pure path logic + directory listing (no writes).
 */
import { readDir, exists } from '@tauri-apps/plugin-fs'
import type { KeyboardDef } from '@/lib/registry/types'

export interface PointingTargets {
  overlays: string[]
  /** default overlay: the `_right` one when present (peripheral half usually carries the sensor) */
  overlay: string | null
  westPath: string | null
  configDir: string | null
  /** set when the folder could not be read (usually: access was never granted) */
  error?: string
}

async function listDir(path: string): Promise<{ name: string; isDirectory: boolean }[]> {
  try { return (await readDir(path)).map(e => ({ name: e.name, isDirectory: !!e.isDirectory })) } catch { return [] }
}

function join(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/')
}

/** The .conf that pairs with an overlay: `foo_right.overlay` → `foo_right.conf`. */
export function confForOverlay(overlayPath: string): string {
  return overlayPath.replace(/\.overlay$/, '.conf')
}

export async function findPointingTargets(kb: KeyboardDef): Promise<PointingTargets> {
  const none: PointingTargets = { overlays: [], overlay: null, westPath: null, configDir: null }
  if (!kb.repoPath) return none
  let root: { name: string; isDirectory: boolean }[]
  try { root = (await readDir(kb.repoPath)).map(e => ({ name: e.name, isDirectory: !!e.isDirectory })) }
  catch (e) { return { ...none, error: `The app cannot read ${kb.repoPath} (${e}). Open Settings › Keyboards › Edit › Files and choose the config folder again to grant access.` } }
  const names = new Set(root.map(e => e.name))
  const configDir = names.has('config') ? join(kb.repoPath, 'config') : root.some(e => e.name.endsWith('.keymap')) ? kb.repoPath : null
  if (!configDir) return none

  const overlays: string[] = []
  const shieldsDir = join(configDir, 'boards', 'shields')
  for (const sd of await listDir(shieldsDir)) {
    if (!sd.isDirectory) continue
    if (kb.shield && sd.name !== kb.shield && !kb.shield.startsWith(sd.name)) continue
    const dir = join(shieldsDir, sd.name)
    for (const f of await listDir(dir)) if (f.name.endsWith('.overlay')) overlays.push(join(dir, f.name))
  }
  overlays.sort((a, b) => (a.endsWith('_right.overlay') ? -1 : 0) - (b.endsWith('_right.overlay') ? -1 : 0) || a.localeCompare(b))
  const westCandidate = join(configDir, 'west.yml')
  const westPath = (await exists(westCandidate).catch(() => false)) ? westCandidate : null
  return { overlays, overlay: overlays[0] ?? null, westPath, configDir }
}
