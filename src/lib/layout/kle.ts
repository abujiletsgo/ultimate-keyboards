/**
 * Import keyboard-layout-editor (KLE) serialized JSON.
 *
 * KLE is stateful: an array of rows, each an array of either a legend string
 * (emits a key) or a property object that changes the cursor. `x`/`y` are
 * offsets added before the next key; `w`/`h` apply to the next key only and
 * reset to 1; `r`/`rx`/`ry` set a rotation that persists; setting `rx`/`ry`
 * moves the cursor to that pivot. After each key the cursor advances by the
 * key's width; each row advances y by one and resets x to `rx`.
 *
 * VIA definitions use the same format with `"row,col"` legends, which we read
 * into `row`/`col`.
 */
import type { PhysicalKey, PhysicalLayout } from './types'
import { normalizeLayout, round3 } from './types'

interface KleProps {
  x?: number; y?: number; w?: number; h?: number
  r?: number; rx?: number; ry?: number
  d?: boolean; a?: number
  [k: string]: unknown
}

export function parseKle(json: string | unknown[], name = 'KLE layout', origin?: string): PhysicalLayout {
  const rows = (typeof json === 'string' ? JSON.parse(json) : json) as unknown[]
  const keys: PhysicalKey[] = []
  let r = 0, rx = 0, ry = 0
  let x = 0, y = 0
  let w = 1, h = 1
  let decal = false
  for (const row of rows) {
    if (!Array.isArray(row)) continue // metadata object
    for (const item of row) {
      if (typeof item === 'object' && item !== null) {
        const p = item as KleProps
        if (p.r !== undefined) r = Number(p.r)
        if (p.rx !== undefined) { rx = Number(p.rx); x = rx }
        if (p.ry !== undefined) { ry = Number(p.ry); y = ry }
        if (p.x !== undefined) x += Number(p.x)
        if (p.y !== undefined) y += Number(p.y)
        if (p.w !== undefined) w = Number(p.w)
        if (p.h !== undefined) h = Number(p.h)
        if (p.d !== undefined) decal = !!p.d
        continue
      }
      const legend = String(item)
      if (!decal) {
        const key: PhysicalKey = { x: round3(x), y: round3(y) }
        if (w !== 1) key.w = round3(w)
        if (h !== 1) key.h = round3(h)
        if (r !== 0) { key.r = r; key.rx = round3(rx); key.ry = round3(ry) }
        const m = /^(\d+),(\d+)/.exec(legend.split('\n')[0].trim())
        if (m) { key.row = Number(m[1]); key.col = Number(m[2]) }
        keys.push(key)
      }
      x += w
      w = 1; h = 1; decal = false
    }
    y += 1
    x = rx
  }
  return normalizeLayout({ name, keys, source: 'kle', origin })
}

/** Serialize to KLE rows (one row per distinct y for unrotated keys; rotated keys get their own rows). */
export function toKle(layout: PhysicalLayout): unknown[] {
  const rows: unknown[][] = []
  const sorted = layout.keys.map((k, i) => ({ k, i })).sort((a, b) => (a.k.r ?? 0) - (b.k.r ?? 0) || a.k.y - b.k.y || a.k.x - b.k.x)
  let curY = -Infinity, curR = 0, curRx = 0, curRy = 0
  let row: unknown[] | null = null
  let cursorX = 0
  for (const { k, i } of sorted) {
    const kr = k.r ?? 0, krx = k.rx ?? 0, kry = k.ry ?? 0
    const newRow = row === null || k.y !== curY || kr !== curR || krx !== curRx || kry !== curRy
    if (newRow) {
      row = []
      rows.push(row)
      const props: KleProps = {}
      if (kr !== curR || krx !== curRx || kry !== curRy) { props.r = kr; props.rx = krx; props.ry = kry; cursorX = krx }
      else cursorX = 0
      const dy = k.y - (curY === -Infinity ? 0 : curY + 1)
      if (newRow && rows.length > 1 && dy !== 0 && !('r' in props)) props.y = round3(dy)
      if (rows.length === 1 && k.y !== 0) props.y = round3(k.y)
      if (Object.keys(props).length) row.push(props)
      curY = k.y; curR = kr; curRx = krx; curRy = kry
    }
    const props: KleProps = {}
    const dx = k.x - cursorX
    if (dx !== 0) props.x = round3(dx)
    if ((k.w ?? 1) !== 1) props.w = k.w
    if ((k.h ?? 1) !== 1) props.h = k.h
    if (Object.keys(props).length) row!.push(props)
    row!.push(k.row !== undefined && k.col !== undefined ? `${k.row},${k.col}` : String(i))
    cursorX = k.x + (k.w ?? 1)
  }
  return rows
}
