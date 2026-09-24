/**
 * Canonical physical-layout model, in key units (1u = one keycap pitch) and
 * degrees. Every importer (ZMK physical-layout dtsi, QMK / keymap-editor
 * info.json, matrix-transform grid, KLE) maps onto this; every renderer and
 * exporter reads from it.
 */

export interface PhysicalKey {
  /** Top-left corner, key units, from the layout's origin. */
  x: number
  y: number
  /** Size in key units (default 1 × 1). */
  w?: number
  h?: number
  /** Rotation in degrees (positive = clockwise) about (rx, ry), key units, absolute. */
  r?: number
  rx?: number
  ry?: number
  /** Electrical matrix position, when the source knows it. */
  row?: number
  col?: number
  /** Which half of a split board, when known. */
  hand?: 'L' | 'R'
  /** Rotary encoder slot rather than a key. */
  encoder?: boolean
}

export type LayoutSource =
  | 'zmk-physical-layout' // zmk,physical-layout devicetree node
  | 'info-json' // QMK info.json / keyboard.json or keymap-editor info.json
  | 'matrix-grid' // derived from a zmk,matrix-transform map (no stagger)
  | 'catalogue' // bundled layout picked by name
  | 'kle' // keyboard-layout-editor serialized JSON
  | 'legacy' // hand-written layout tables from before the registry

export interface PhysicalLayout {
  /** Human name, e.g. "6 Column" or "LAYOUT_split_3x6_3". */
  name: string
  /** Keys in keymap position order (index = ZMK position / QMK layout index). */
  keys: PhysicalKey[]
  source: LayoutSource
  /** Where it came from (file path, catalogue id, node label). */
  origin?: string
}

/** Axis-aligned bounds of a layout in key units (rotation ignored for now). */
export function layoutBounds(layout: PhysicalLayout): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const k of layout.keys) {
    const w = k.w ?? 1, h = k.h ?? 1
    minX = Math.min(minX, k.x)
    minY = Math.min(minY, k.y)
    maxX = Math.max(maxX, k.x + w)
    maxY = Math.max(maxY, k.y + h)
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}

/** Shift a layout so its top-left key sits at (0, 0). */
export function normalizeLayout(layout: PhysicalLayout): PhysicalLayout {
  const b = layoutBounds(layout)
  if (b.minX === 0 && b.minY === 0) return layout
  return {
    ...layout,
    keys: layout.keys.map(k => ({
      ...k,
      x: round3(k.x - b.minX),
      y: round3(k.y - b.minY),
      ...(k.rx !== undefined ? { rx: round3(k.rx - b.minX) } : {}),
      ...(k.ry !== undefined ? { ry: round3(k.ry - b.minY) } : {}),
    })),
  }
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
