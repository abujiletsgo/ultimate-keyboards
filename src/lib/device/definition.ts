/**
 * VIA v3 definitions and Vial's vial.json share one shape:
 *   { name?, matrix: { rows, cols }, layouts: { keymap: KLE rows, labels? }, … }
 * Each KLE key's top-left legend is "row,col"; the bottom-right legend is
 * "option,choice" for layout options (only choice 0 is the default layout);
 * a centre legend "e" marks an encoder, which is not a matrix key.
 *
 * KLE's serialized legend order depends on the alignment flag `a`; the map
 * below is kle-serial's `labelMap` (ijprest/kle-serial, MIT), giving the
 * 12-slot label index (0 top-left … 8 bottom-right …) for each text line.
 */
import { parseKle } from '../layout/kle'
import type { PhysicalLayout } from '../layout/types'

const LABEL_MAP: number[][] = [
  [0, 6, 2, 8, 9, 11, 3, 5, 1, 4, 7, 10],
  [1, 7, -1, -1, 9, 11, 4, -1, -1, -1, -1, 10],
  [3, -1, 5, -1, 9, 11, -1, -1, 4, -1, -1, 10],
  [4, -1, -1, -1, 9, 11, -1, -1, -1, -1, -1, 10],
  [0, 6, 2, 8, 10, -1, 3, 5, 1, 4, 7, -1],
  [1, 7, -1, -1, 10, -1, 4, -1, -1, -1, -1, -1],
  [3, -1, 5, -1, 10, -1, -1, -1, 4, -1, -1, -1],
  [4, -1, -1, -1, 10, -1, -1, -1, -1, -1, -1, -1],
]

/** Legend text → the 12 KLE label slots, honouring alignment `a` (default 4). */
export function kleLabels(legend: string, align = 4): string[] {
  const labels: string[] = new Array(12).fill('')
  const map = LABEL_MAP[align] ?? LABEL_MAP[4]
  legend.split('\n').forEach((text, i) => {
    const slot = map[i]
    if (slot !== undefined && slot >= 0) labels[slot] = text
  })
  return labels
}

export interface KeyboardDefinition {
  name?: string
  vendorId?: string | number
  productId?: string | number
  matrix: { rows: number; cols: number }
  layouts: { keymap: unknown[]; labels?: unknown[] }
  lighting?: string
  menus?: unknown[]
  [k: string]: unknown
}

export interface DefinitionLayout {
  layout: PhysicalLayout
  /** Matrix position of each layout key, in layout key order. */
  matrix: Array<{ row: number; col: number }>
  rows: number
  cols: number
}

export function parseDefinition(json: string | unknown): KeyboardDefinition {
  const d = (typeof json === 'string' ? JSON.parse(json) : json) as KeyboardDefinition
  if (!d || typeof d !== 'object') throw new Error('keyboard definition is not an object')
  const rows = Number(d.matrix?.rows)
  const cols = Number(d.matrix?.cols)
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0 || rows * cols > 4096) {
    throw new Error('keyboard definition has no valid matrix size')
  }
  if (!Array.isArray(d.layouts?.keymap)) throw new Error('keyboard definition has no layouts.keymap')
  return d
}

/**
 * Definition → PhysicalLayout (default layout options only) + matrix mapping.
 * Non-default option keys and encoders become KLE decals, so the cursor still
 * advances exactly as in the source, then the existing KLE importer runs.
 */
export function definitionLayout(def: KeyboardDefinition, name?: string, origin?: string): DefinitionLayout {
  const rows = Number(def.matrix.rows)
  const cols = Number(def.matrix.cols)
  let align = 4
  const cleaned: unknown[] = []
  for (const row of def.layouts.keymap) {
    if (!Array.isArray(row)) { cleaned.push(row); continue }
    const out: unknown[] = []
    for (const item of row) {
      if (typeof item === 'object' && item !== null) {
        const a = (item as { a?: unknown }).a
        if (a !== undefined) align = Number(a)
        out.push(item)
        continue
      }
      const labels = kleLabels(String(item), align)
      const option = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(labels[8])
      const skip = (option && Number(option[2]) !== 0) || labels.some(l => l.trim() === 'e')
      if (skip) { out.push({ d: true }); out.push('') ; continue }
      out.push(labels[0])
    }
    cleaned.push(out)
  }
  const layout = parseKle(cleaned, name ?? def.name ?? 'Keyboard', origin)
  const matrix = layout.keys.map((k, i) => {
    if (k.row === undefined || k.col === undefined) throw new Error(`layout key ${i} has no "row,col" legend`)
    if (k.row >= rows || k.col >= cols) throw new Error(`layout key ${i} (${k.row},${k.col}) is outside the ${rows}×${cols} matrix`)
    return { row: k.row, col: k.col }
  })
  return { layout, matrix, rows, cols }
}

/** Which lighting protocol a definition declares. */
export type LightingKind = 'vialrgb' | 'rgb_matrix' | 'rgblight' | 'backlight' | 'none'

export function lightingKind(def: KeyboardDefinition): LightingKind {
  const l = typeof def.lighting === 'string' ? def.lighting : ''
  if (l === 'vialrgb') return 'vialrgb'
  if (l.includes('rgblight')) return 'rgblight'
  if (l.includes('backlight')) return 'backlight'
  const menus = JSON.stringify(def.menus ?? [])
  if (menus.includes('qmk_rgb_matrix')) return 'rgb_matrix'
  if (menus.includes('qmk_rgblight')) return 'rgblight'
  if (menus.includes('qmk_backlight')) return 'backlight'
  return 'none'
}
