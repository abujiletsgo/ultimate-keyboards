/**
 * Detect what a keyboard config folder contains, so "Add keyboard" can be
 * one folder pick instead of a form:
 *
 *   ZMK config repo:  build.yaml (shields, or boards with the controller built
 *                     in), config/*.keymap, config/*.json (keymap-editor
 *                     info.json), config/boards/shields/<s>/ (*.dtsi with
 *                     zmk,physical-layout or a matrix-transform, *.overlay with a
 *                     zmk,input-listener), config/west.yml
 *   QMK keymap:       a keymap JSON (QMK Configurator / `qmk c2json` keymap.json
 *                     or a VIA export) anywhere a few folders down, as in a
 *                     qmk_userspace repo (keyboards/<vendor>/<kb>/keymaps/<km>/)
 *                     or a lone keymap folder; keymap.c next to it for combos;
 *                     keyboard.json / info.json with layouts from its folders
 *
 * File access goes through `DetectFs` so tests can run on an in-memory tree.
 */
import { readDir, readTextFile } from '@tauri-apps/plugin-fs'
import {
  parseZmkPhysicalLayouts, parseInfoJsonLayouts, parseMatrixTransforms, gridLayoutFromTransform,
  type PhysicalLayout,
} from '@/lib/layout'
import { findCatalogueLayout } from '@/lib/layout/catalogue'
import { ZMK_KEYBOARDS } from '@/lib/catalogue'
import { parseBuildTargets, partBase } from './parts'
import type { Firmware, PointingDescriptor } from './types'

export interface LayoutCandidate {
  label: string
  layout: PhysicalLayout
}

export interface DetectedKeyboard {
  firmware: Firmware
  /** config repo root; absent for a lone keymap file outside a repo */
  repoPath?: string
  suggestedName: string
  shield?: string
  keymapCandidates: string[]
  keymapCPath?: string
  layoutCandidates: LayoutCandidate[]
  pointing: PointingDescriptor[]
  notes: string[]
  /** QMK only: what the keymap JSON says about itself */
  qmk?: QmkKeymapFacts
}

export interface QmkKeymapFacts {
  /** QMK keyboard path, e.g. `keychron/q1v2/ansi_encoder`, when the JSON or its folder names it */
  keyboard?: string
  /** layout macro the keymap is written for, e.g. `LAYOUT_ansi_82` (Configurator keymap.json only) */
  layout?: string
  /** entries per layer in the file */
  keyCount: number
  /** true for keymap.json (one entry per layout key); false for a VIA export (rows × cols matrix order) */
  perLayoutKey: boolean
}

/** Detection failed for a reason the user can act on. */
export class DetectError extends Error {}

export interface DetectFs {
  list(path: string): Promise<{ name: string; isDirectory: boolean }[]>
  read(path: string): Promise<string | null>
}

const SENSOR_PROFILES: Record<string, { name: string; chip: string; supports: PointingDescriptor['supports'] }> = {
  'azoteq,iqs5xx': {
    name: 'Trackpad', chip: 'Azoteq IQS5XX',
    supports: { cursorScaler: true, chipSensitivity: false, cpi: false, invertXY: false, smartMode: false, scrollToggles: true, gestures: true, advancedAzoteq: true, snipe: true, scrollLayer: true },
  },
  'pixart,pmw3610': {
    name: 'Trackball', chip: 'Pixart PMW3610',
    supports: { cursorScaler: true, chipSensitivity: false, cpi: true, invertXY: true, smartMode: true, scrollToggles: false, gestures: false, advancedAzoteq: false, snipe: true, scrollLayer: true },
  },
  'pixart,pmw3610-alt': {
    name: 'Trackball', chip: 'Pixart PMW3610',
    supports: { cursorScaler: true, chipSensitivity: false, cpi: true, invertXY: true, smartMode: true, scrollToggles: false, gestures: false, advancedAzoteq: false, snipe: true, scrollLayer: true },
  },
  'pixart,pmw3360': {
    name: 'Trackball', chip: 'Pixart PMW3360',
    supports: { cursorScaler: true, chipSensitivity: false, cpi: true, invertXY: true, smartMode: false, scrollToggles: false, gestures: false, advancedAzoteq: false, snipe: true, scrollLayer: true },
  },
  'cirque,pinnacle': {
    name: 'Trackpad', chip: 'Cirque Pinnacle',
    supports: { cursorScaler: true, chipSensitivity: true, cpi: false, invertXY: true, smartMode: false, scrollToggles: false, gestures: false, advancedAzoteq: false, snipe: true, scrollLayer: true },
  },
}

const tauriFs: DetectFs = {
  async list(path) {
    try {
      const entries = await readDir(path)
      return entries.map(e => ({ name: e.name, isDirectory: !!e.isDirectory }))
    } catch {
      return []
    }
  },
  async read(path) {
    try { return await readTextFile(path) } catch { return null }
  },
}

const join = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/')

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Find pointing sensors + their input listeners in an overlay. */
export function detectPointingInOverlay(text: string, overlayPath: string): PointingDescriptor[] {
  const out: PointingDescriptor[] = []
  // sensor nodes:  label: name@addr { ... compatible = "vendor,chip"; ... }
  const nodeRe = /(\w+)\s*:\s*([\w-]+@[0-9a-fA-Fx]+)\s*\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = nodeRe.exec(text)) !== null) {
    const compat = /compatible\s*=\s*"([^"]+)"/.exec(m[3])?.[1]
    if (!compat) continue
    const profile = SENSOR_PROFILES[compat]
    if (!profile) continue
    const label = m[1]
    // listener referencing this sensor: X { compatible = "zmk,input-listener"; device = <&label>; }
    const listenerRe = new RegExp(`(\\w+)\\s*\\{[^{}]*compatible\\s*=\\s*"zmk,input-listener"[^{}]*device\\s*=\\s*<\\s*&${esc(label)}\\s*>`, 'g')
    const lm = listenerRe.exec(text)
    out.push({
      id: label,
      name: profile.name,
      chip: profile.chip,
      compatible: compat,
      overlayPath,
      sensorNodeRe: `${esc(label)}\\s*:\\s*${esc(m[2])}\\s*\\{`,
      listenerNodeRe: lm ? `${esc(lm[1])}\\s*\\{` : `${esc(label)}_listener\\s*\\{`,
      supports: profile.supports,
    })
  }
  return out
}


/** The bundled ZMK catalogue keyboard a build target belongs to (`glove80_lh` → Glove80, `nice60` → nice!60). */
export function zmkCatalogueKeyboard(target: string | undefined) {
  if (!target) return undefined
  const base = partBase(target)
  return ZMK_KEYBOARDS.find(k => k.id.replace(/\/\/.*$/, '') === base || k.siblings.some(s => s === target || partBase(s) === base))
}

export async function detectKeyboard(repoPath: string, fs: DetectFs = tauriFs): Promise<DetectedKeyboard | null> {
  const root = await fs.list(repoPath)
  const folderName = repoPath.split('/').filter(Boolean).pop() ?? 'keyboard'

  // ── ZMK config repo ───────────────────────────────────────────────────────
  const hasConfig = root.some(e => e.name === 'config' && e.isDirectory)
  const configDir = hasConfig ? join(repoPath, 'config') : root.some(e => e.name === 'build.yaml' || e.name.endsWith('.keymap')) ? repoPath : null
  if (configDir) {
    const zmk = await detectZmk(repoPath, configDir, folderName, fs)
    if (zmk) return zmk
  }
  return detectQmk(repoPath, folderName, fs)
}

async function detectZmk(repoPath: string, configDir: string, folderName: string, fs: DetectFs): Promise<DetectedKeyboard | null> {
  const notes: string[] = []
  const cfg = await fs.list(configDir)
  const keymaps = cfg.filter(e => e.name.endsWith('.keymap')).map(e => e.name)
  if (keymaps.length === 0) return null
  const buildYaml = await fs.read(join(repoPath, 'build.yaml'))
  const targets = buildYaml ? parseBuildTargets(buildYaml) : []
  const base = targets[0] ? partBase(targets[0].name) : undefined
  const catalogued = zmkCatalogueKeyboard(targets[0]?.name)
  // prefer the keymap named after the keyboard (ZMK looks it up by shield or board name)
  const keymapCandidates = keymaps.map(k => join(configDir, k))
  const named = (p: string) => !!base && (p.endsWith(`/${base}.keymap`) || p.endsWith(`/${targets[0]?.name}.keymap`))
  keymapCandidates.sort((a, b) => Number(named(b)) - Number(named(a)))

  const layoutCandidates: LayoutCandidate[] = []
  // keymap-editor info.json next to the keymap
  for (const e of cfg.filter(e => e.name.endsWith('.json'))) {
    const text = await fs.read(join(configDir, e.name))
    if (!text) continue
    try {
      for (const l of parseInfoJsonLayouts(text, e.name)) layoutCandidates.push({ label: `${e.name} · ${l.id}`, layout: l.layout })
    } catch { /* not an info.json */ }
  }
  // shield directory: physical layouts, matrix transforms, overlays
  const pointing: PointingDescriptor[] = []
  const shieldsDir = join(configDir, 'boards', 'shields')
  for (const sd of await fs.list(shieldsDir)) {
    if (!sd.isDirectory) continue
    const dir = join(shieldsDir, sd.name)
    for (const f of await fs.list(dir)) {
      const p = join(dir, f.name)
      if (f.name.endsWith('.dtsi')) {
        const text = await fs.read(p)
        if (!text) continue
        for (const n of parseZmkPhysicalLayouts(text, p)) layoutCandidates.push({ label: `${f.name} · ${n.displayName}`, layout: n.layout })
        for (const t of parseMatrixTransforms(text)) layoutCandidates.push({ label: `${f.name} · ${t.label} (grid)`, layout: gridLayoutFromTransform(t) })
      } else if (f.name.endsWith('.overlay')) {
        const text = await fs.read(p)
        if (text) pointing.push(...detectPointingInOverlay(text, p))
      }
    }
  }
  // bundled ZMK keyboard (boards with the controller built in, and in-tree shields)
  if (catalogued) layoutCandidates.push({ label: `Catalogue · ${catalogued.name}`, layout: catalogued.layout })
  // shared ZMK layouts by name
  const cat = findCatalogueLayout(base ?? folderName)
  if (cat && !layoutCandidates.some(c => c.layout.origin === cat.layout.origin)) layoutCandidates.push({ label: `Catalogue · ${cat.board} ${cat.displayName}`, layout: cat.layout })
  if (layoutCandidates.length === 0) notes.push('No physical layout found; pick one from the catalogue or use the grid fallback.')
  // west.yml module hints
  const west = await fs.read(join(configDir, 'west.yml'))
  if (west && /azoteq|pmw3610|pmw3360|cirque|trackball|trackpad/i.test(west) && pointing.length === 0) {
    notes.push('west.yml pulls a pointing-device module but no sensor node was found in the overlays.')
  }
  return {
    firmware: 'zmk', repoPath,
    suggestedName: catalogued?.name ?? prettyName(base ?? folderName),
    shield: base, keymapCandidates, layoutCandidates, pointing, notes,
  }
}

// ── QMK ──────────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', '.build', 'build', 'firmware', 'lib', '.venv', 'dist'])
const NOT_KEYMAPS = new Set(['info.json', 'keyboard.json', 'qmk.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'devcontainer.json'])
/** Folders visited before giving up: a keymap folder or a userspace repo is far smaller. */
const MAX_DIRS = 300
const MAX_DEPTH = 7

/** Facts about a keymap JSON, or null when the text is not one. */
export function qmkKeymapFacts(text: string, path: string): QmkKeymapFacts | null {
  let doc: { layers?: unknown; keyboard?: unknown; layout?: unknown; vendorProductId?: unknown }
  try { doc = JSON.parse(text) } catch { return null }
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.layers) || doc.layers.length === 0) return null
  const first = doc.layers[0]
  if (!Array.isArray(first) || first.length === 0 || !first.every(k => typeof k === 'string')) return null
  const keyboard = typeof doc.keyboard === 'string' && doc.keyboard ? doc.keyboard : keyboardFromPath(path)
  return {
    keyboard,
    layout: typeof doc.layout === 'string' ? doc.layout : undefined,
    keyCount: first.length,
    perLayoutKey: typeof doc.layout === 'string',
  }
}

/** `…/keyboards/keychron/q1v2/ansi_encoder/keymaps/me/keymap.json` → `keychron/q1v2/ansi_encoder`. */
export function keyboardFromPath(path: string): string | undefined {
  const m = /(?:^|\/)keyboards\/(.+?)\/keymaps\/[^/]+\/[^/]+$/.exec(path)
  return m?.[1]
}

async function walk(fs: DetectFs, root: string): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = []
  let dirs = 0
  const queue: Array<[string, number]> = [[root, 0]]
  while (queue.length) {
    const [dir, depth] = queue.shift()!
    if (++dirs > MAX_DIRS) return { files, truncated: true }
    for (const e of await fs.list(dir)) {
      const p = join(dir, e.name)
      if (e.isDirectory) { if (depth < MAX_DEPTH && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) queue.push([p, depth + 1]) }
      else files.push(p)
    }
  }
  return { files, truncated: false }
}

const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/'))

async function detectQmk(repoPath: string, folderName: string, fs: DetectFs): Promise<DetectedKeyboard | null> {
  const { files, truncated } = await walk(fs, repoPath)
  const notes: string[] = []
  if (truncated) notes.push('This folder is large, so only part of it was searched. If your keymap is missing, choose the keymap folder itself.')

  // keymap JSONs, nearest the chosen folder first
  const depth = (p: string) => p.split('/').length
  const keymaps: Array<{ path: string; facts: QmkKeymapFacts }> = []
  for (const p of files.filter(f => f.endsWith('.json') && !NOT_KEYMAPS.has(f.split('/').pop()!)).sort((a, b) => depth(a) - depth(b)).slice(0, 40)) {
    const text = await fs.read(p)
    const facts = text ? qmkKeymapFacts(text, p) : null
    if (facts) keymaps.push({ path: p, facts })
  }
  const keymapCs = files.filter(f => f.endsWith('/keymap.c'))

  if (keymaps.length === 0) {
    if (keymapCs.length > 0) {
      const kc = keymapCs[0]
      const kb = keyboardFromPath(kc) ?? '<keyboard>'
      const km = kc.split('/').slice(-2, -1)[0]
      throw new DetectError(
        `Found ${kc.slice(repoPath.length + 1) || 'keymap.c'}, but no keymap JSON. This app edits QMK keymaps as keymap.json. ` +
        `Make one with the QMK CLI: qmk c2json -kb ${kb} -km ${km} -o keymap.json ${kc}, save it next to keymap.c, and choose this folder again.`,
      )
    }
    return null
  }

  const chosen = keymaps[0]
  const dir = parentOf(chosen.path)
  const keymapCPath = keymapCs.find(c => parentOf(c) === dir) ?? keymapCs.find(c => c.endsWith('/keymaps/default/keymap.c'))

  // layouts: keyboard.json / info.json in the keymap's ancestors first (QMK merges them down the tree), then anywhere else
  const metas = files.filter(f => /\/(keyboard|info)\.json$/.test(f))
  const ancestor = (m: string) => dir.startsWith(parentOf(m) + '/') || dir === parentOf(m)
  metas.sort((a, b) => Number(ancestor(b)) - Number(ancestor(a)) || depth(b) - depth(a))
  const layoutCandidates: LayoutCandidate[] = []
  for (const m of metas.slice(0, 20)) {
    const text = await fs.read(m)
    if (!text) continue
    const rel = m.slice(repoPath.length + 1)
    try {
      for (const l of parseInfoJsonLayouts(text, rel)) layoutCandidates.push({ label: `${rel} · ${l.id}`, layout: l.layout })
    } catch { /* not a layout file */ }
  }
  // the keymap's own layout macro first
  if (chosen.facts.layout) layoutCandidates.sort((a, b) => Number(b.layout.name === chosen.facts.layout) - Number(a.layout.name === chosen.facts.layout))
  if (layoutCandidates.length === 0) notes.push(chosen.facts.keyboard
    ? `No keyboard.json or info.json here; the layout of ${chosen.facts.keyboard} is downloaded from QMK.`
    : 'No keyboard.json or info.json here; pick a layout from the catalogue or use the grid.')

  const keyboard = chosen.facts.keyboard
  return {
    firmware: 'qmk', repoPath,
    suggestedName: prettyName(keyboard ? keyboard.split('/').filter(s => !/^(rev\d+|base|ansi|iso|jis)$/i.test(s)).join(' ') : folderName),
    shield: keyboard,
    keymapCandidates: keymaps.map(k => k.path),
    keymapCPath, layoutCandidates, pointing: [], notes, qmk: chosen.facts,
  }
}

function prettyName(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
