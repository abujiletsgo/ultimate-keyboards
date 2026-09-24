/**
 * Import QMK `info.json` / `keyboard.json` layouts and keymap-editor
 * `info.json` (same shape, `row`/`col` instead of `matrix`).
 *
 *   { "layouts": { "LAYOUT_x": { "layout": [ { x, y, w?, h?, r?, rx?, ry?,
 *       matrix?: [row, col], row?, col?, label?, encoder?, hand? } ] } } }
 *
 * Units are key units and degrees, absolute from the top-left.
 */
import type { PhysicalKey, PhysicalLayout } from './types'
import { normalizeLayout } from './types'

export interface InfoJsonLayout {
  /** layout key, e.g. LAYOUT_split_3x6_3 or default_layout */
  id: string
  layout: PhysicalLayout
}

interface RawKey {
  x: number; y: number; w?: number; h?: number; r?: number; rx?: number; ry?: number
  matrix?: [number, number]; row?: number; col?: number
  encoder?: number | boolean; hand?: string; label?: string
}

export function parseInfoJsonLayouts(text: string, origin?: string): InfoJsonLayout[] {
  const doc = JSON.parse(text) as { layouts?: Record<string, { layout?: RawKey[] }>; keyboard_name?: string; name?: string }
  const layouts = doc.layouts
  if (!layouts || typeof layouts !== 'object') return []
  const out: InfoJsonLayout[] = []
  for (const [id, def] of Object.entries(layouts)) {
    const raw = def?.layout
    if (!Array.isArray(raw) || raw.length === 0) continue
    const keys: PhysicalKey[] = raw.map(k => {
      const key: PhysicalKey = { x: Number(k.x) || 0, y: Number(k.y) || 0 }
      if (k.w !== undefined && Number(k.w) !== 1) key.w = Number(k.w)
      if (k.h !== undefined && Number(k.h) !== 1) key.h = Number(k.h)
      if (k.r !== undefined && Number(k.r) !== 0) {
        key.r = Number(k.r)
        key.rx = Number(k.rx ?? k.x)
        key.ry = Number(k.ry ?? k.y)
      }
      if (Array.isArray(k.matrix)) { key.row = k.matrix[0]; key.col = k.matrix[1] }
      else {
        if (k.row !== undefined) key.row = Number(k.row)
        if (k.col !== undefined) key.col = Number(k.col)
      }
      if (k.encoder !== undefined && k.encoder !== false) key.encoder = true
      if (k.hand === 'L' || k.hand === 'R') key.hand = k.hand
      return key
    })
    out.push({ id, layout: normalizeLayout({ name: id, keys, source: 'info-json', origin }) })
  }
  return out
}

/** Serialize to a QMK-style info.json `layouts` object. */
export function toInfoJsonLayouts(layouts: { id: string; layout: PhysicalLayout }[]): string {
  const obj: Record<string, { layout: Record<string, unknown>[] }> = {}
  for (const { id, layout } of layouts) {
    obj[id] = {
      layout: layout.keys.map(k => {
        const o: Record<string, unknown> = {}
        if (k.row !== undefined && k.col !== undefined) o.matrix = [k.row, k.col]
        o.x = k.x; o.y = k.y
        if (k.w !== undefined) o.w = k.w
        if (k.h !== undefined) o.h = k.h
        if (k.r !== undefined) { o.r = k.r; o.rx = k.rx; o.ry = k.ry }
        if (k.encoder) o.encoder = 0
        if (k.hand) o.hand = k.hand
        return o
      }),
    }
  }
  return JSON.stringify({ layouts: obj }, null, 2) + '\n'
}
