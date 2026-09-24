/**
 * Fallback layout derived from a `zmk,matrix-transform` node: one 1u key per
 * `RC(row, col)` entry, placed on a plain grid at (col, row), in map order
 * (which is the keymap position order). No stagger, no rotation — it is only
 * ever used when no real physical layout is known.
 *
 * Split boards usually mirror columns on the right half (RC(0,11) … RC(0,6)),
 * so a visual gap is inserted where the column index jumps by more than one
 * between neighbours on the same row.
 */
import type { PhysicalKey, PhysicalLayout } from './types'

export interface MatrixTransform {
  label: string
  rows: number
  columns: number
  /** [row, col] per keymap position */
  map: [number, number][]
}

const NODE_RE = /(?:(\w+)\s*:\s*)?(\w+)\s*\{([^{}]*?compatible\s*=\s*"zmk,matrix-transform"[^{}]*)\}/g

export function parseMatrixTransforms(source: string): MatrixTransform[] {
  const out: MatrixTransform[] = []
  NODE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NODE_RE.exec(source)) !== null) {
    const body = m[3]
    const rows = parseInt(/rows\s*=\s*<\s*(\d+)\s*>/.exec(body)?.[1] ?? '0', 10)
    const columns = parseInt(/columns\s*=\s*<\s*(\d+)\s*>/.exec(body)?.[1] ?? '0', 10)
    const mapBody = /map\s*=\s*<([^>]*)>/.exec(body)?.[1] ?? ''
    const map: [number, number][] = []
    const rc = /RC\(\s*(\d+)\s*,\s*(\d+)\s*\)/g
    let r: RegExpExecArray | null
    while ((r = rc.exec(mapBody)) !== null) map.push([parseInt(r[1], 10), parseInt(r[2], 10)])
    if (map.length === 0) continue
    out.push({ label: m[1] ?? m[2], rows, columns, map })
  }
  return out
}

export function gridLayoutFromTransform(t: MatrixTransform): PhysicalLayout {
  // Group by row to detect column gaps (split halves).
  const keys: PhysicalKey[] = t.map.map(([row, col]) => ({ x: col, y: row, row, col }))
  const byRow = new Map<number, PhysicalKey[]>()
  for (const k of keys) {
    const list = byRow.get(k.row!) ?? []
    list.push(k)
    byRow.set(k.row!, list)
  }
  // Insert a 0.5u gap at every column jump > 1 (consistent across rows).
  const gapAfterCol = new Set<number>()
  for (const list of byRow.values()) {
    const cols = [...new Set(list.map(k => k.col!))].sort((a, b) => a - b)
    for (let i = 1; i < cols.length; i++) {
      if (cols[i] - cols[i - 1] > 1) gapAfterCol.add(cols[i - 1])
    }
  }
  const gaps = [...gapAfterCol].sort((a, b) => a - b)
  for (const k of keys) {
    const extra = gaps.filter(g => k.col! > g).length * 0.5
    k.x = k.col! + extra
  }
  return { name: t.label, keys, source: 'matrix-grid', origin: t.label }
}
