/**
 * Detect what a keyboard config folder contains, so "Add keyboard" can be
 * one folder pick instead of a form:
 *
 *   ZMK config repo:  build.yaml (shields), config/*.keymap, config/*.json
 *                     (keymap-editor info.json), config/boards/shields/<s>/
 *                     (*.dtsi with zmk,physical-layout or a matrix-transform,
 *                     *_right.overlay with a zmk,input-listener), config/west.yml
 *   QMK keymap dir:   *.layout.json (VIA export) + <kb>/keymaps/<name>/keymap.c
 *                     + keyboard.json / info.json with layouts
 */
import { readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import {
  parseZmkPhysicalLayouts, parseInfoJsonLayouts, parseMatrixTransforms, gridLayoutFromTransform,
  type PhysicalLayout,
} from '@/lib/layout'
import { findCatalogueLayout } from '@/lib/layout/catalogue'
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

async function listDir(path: string): Promise<{ name: string; isDirectory: boolean }[]> {
  try {
    const entries = await readDir(path)
    return entries.map(e => ({ name: e.name, isDirectory: !!e.isDirectory }))
  } catch {
    return []
  }
}

async function readOr(path: string): Promise<string | null> {
  try { return await readTextFile(path) } catch { return null }
}

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

function parseBuildYamlShields(text: string): string[] {
  const shields: string[] = []
  const re = /^\s*shield:\s*([\w-]+)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) shields.push(m[1])
  return [...new Set(shields)]
}

export async function detectKeyboard(repoPath: string): Promise<DetectedKeyboard | null> {
  const notes: string[] = []
  const root = await listDir(repoPath)
  const names = new Set(root.map(e => e.name))
  const folderName = repoPath.split('/').filter(Boolean).pop() ?? 'keyboard'

  // ── ZMK config repo ───────────────────────────────────────────────────────
  const configDir = names.has('config') ? await join(repoPath, 'config') : names.has('build.yaml') || root.some(e => e.name.endsWith('.keymap')) ? repoPath : null
  if (configDir) {
    const cfg = await listDir(configDir)
    const keymaps = cfg.filter(e => e.name.endsWith('.keymap')).map(e => e.name)
    if (keymaps.length > 0) {
      const buildYaml = await readOr(await join(repoPath, 'build.yaml'))
      const shields = buildYaml ? parseBuildYamlShields(buildYaml).filter(s => s !== 'settings_reset') : []
      const shieldBase = shields[0]?.replace(/_(left|right|dongle|central|peripheral)$/, '')
      const keymapCandidates: string[] = []
      for (const k of keymaps) keymapCandidates.push(await join(configDir, k))
      // prefer the keymap named after the shield
      keymapCandidates.sort((a, b) => (shieldBase && a.endsWith(`/${shieldBase}.keymap`) ? -1 : 0) - (shieldBase && b.endsWith(`/${shieldBase}.keymap`) ? -1 : 0))

      const layoutCandidates: LayoutCandidate[] = []
      // keymap-editor info.json next to the keymap
      for (const e of cfg.filter(e => e.name.endsWith('.json'))) {
        const text = await readOr(await join(configDir, e.name))
        if (!text) continue
        try {
          for (const l of parseInfoJsonLayouts(text, e.name)) layoutCandidates.push({ label: `${e.name} · ${l.id}`, layout: l.layout })
        } catch { /* not an info.json */ }
      }
      // shield directory: physical layouts, matrix transforms, overlays
      const pointing: PointingDescriptor[] = []
      const shieldsDir = await join(configDir, 'boards', 'shields')
      for (const sd of await listDir(shieldsDir)) {
        if (!sd.isDirectory) continue
        const dir = await join(shieldsDir, sd.name)
        for (const f of await listDir(dir)) {
          const p = await join(dir, f.name)
          if (f.name.endsWith('.dtsi')) {
            const text = await readOr(p)
            if (!text) continue
            for (const n of parseZmkPhysicalLayouts(text, p)) layoutCandidates.push({ label: `${f.name} · ${n.displayName}`, layout: n.layout })
            for (const t of parseMatrixTransforms(text)) layoutCandidates.push({ label: `${f.name} · ${t.label} (grid)`, layout: gridLayoutFromTransform(t) })
          } else if (f.name.endsWith('.overlay')) {
            const text = await readOr(p)
            if (text) pointing.push(...detectPointingInOverlay(text, p))
          }
        }
      }
      // catalogue by shield name
      const cat = findCatalogueLayout(shieldBase ?? folderName)
      if (cat) layoutCandidates.push({ label: `Catalogue · ${cat.board} ${cat.displayName}`, layout: cat.layout })
      if (layoutCandidates.length === 0) notes.push('No physical layout found; pick one from the catalogue or use the grid fallback.')
      // west.yml module hints
      const west = await readOr(await join(configDir, 'west.yml'))
      if (west && /azoteq|pmw3610|pmw3360|cirque|trackball|trackpad/i.test(west) && pointing.length === 0) {
        notes.push('west.yml pulls a pointing-device module but no sensor node was found in the overlays.')
      }
      return {
        firmware: 'zmk', repoPath, suggestedName: shieldBase ? prettyName(shieldBase) : prettyName(folderName),
        shield: shieldBase, keymapCandidates, layoutCandidates, pointing, notes,
      }
    }
  }

  // ── QMK: a VIA layout export and/or a keyboard source dir ─────────────────
  const viaJson = root.find(e => e.name.endsWith('.layout.json') || e.name.endsWith('.json'))
  let keymapCPath: string | undefined
  const layoutCandidates: LayoutCandidate[] = []
  let shield: string | undefined
  for (const d of root.filter(e => e.isDirectory)) {
    const dir = await join(repoPath, d.name)
    for (const meta of ['keyboard.json', 'info.json']) {
      const text = await readOr(await join(dir, meta))
      if (!text) continue
      try {
        for (const l of parseInfoJsonLayouts(text, `${d.name}/${meta}`)) layoutCandidates.push({ label: `${d.name}/${meta} · ${l.id}`, layout: l.layout })
        shield = d.name
      } catch { /* ignore */ }
    }
    const km = await join(dir, 'keymaps', 'default', 'keymap.c')
    if (await readOr(km)) keymapCPath = km
  }
  if (viaJson) {
    return {
      firmware: 'qmk', repoPath, suggestedName: prettyName(shield ?? folderName), shield,
      keymapCandidates: [await join(repoPath, viaJson.name)], keymapCPath, layoutCandidates, pointing: [],
      notes: layoutCandidates.length ? [] : ['No keyboard.json/info.json with layouts found; pick a layout from the catalogue.'],
    }
  }
  return null
}

function prettyName(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
