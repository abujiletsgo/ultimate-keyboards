/**
 * Import ZMK `zmk,physical-layout` devicetree nodes.
 *
 *   keys = <&key_physical_attrs w h x y rot rx ry>, ...;
 *
 * Units: centi-keyunits (100 = 1u) and centidegrees; negatives are written
 * as `(-3000)`. One file may hold several layouts (e.g. corne 5/6 column).
 */
import type { PhysicalKey, PhysicalLayout } from './types'
import { normalizeLayout, round3 } from './types'

export interface ZmkPhysicalLayoutNode {
  /** devicetree label, e.g. `foostan_corne_6col_layout` */
  label: string
  displayName: string
  layout: PhysicalLayout
}

const NODE_RE = /(?:(\w+)\s*:\s*)?(\w+)\s*\{([^{}]*?compatible\s*=\s*"zmk,physical-layout"[^{}]*)\}/g
const KEY_RE = /&key_physical_attrs\s+((?:\(?-?\d+\)?\s*){7})/g

function num(tok: string): number {
  return parseInt(tok.replace(/[()]/g, ''), 10)
}

export function parseZmkPhysicalLayouts(source: string, origin?: string): ZmkPhysicalLayoutNode[] {
  const out: ZmkPhysicalLayoutNode[] = []
  NODE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NODE_RE.exec(source)) !== null) {
    const label = m[1] ?? m[2]
    const body = m[3]
    const nameMatch = /display-name\s*=\s*"([^"]*)"/.exec(body)
    const keys: PhysicalKey[] = []
    KEY_RE.lastIndex = 0
    let k: RegExpExecArray | null
    while ((k = KEY_RE.exec(body)) !== null) {
      const t = k[1].trim().split(/\s+/).map(num)
      const [w, h, x, y, rot, rx, ry] = t
      const key: PhysicalKey = { x: round3(x / 100), y: round3(y / 100) }
      if (w !== 100) key.w = round3(w / 100)
      if (h !== 100) key.h = round3(h / 100)
      if (rot !== 0) {
        key.r = round3(rot / 100)
        key.rx = round3(rx / 100)
        key.ry = round3(ry / 100)
      }
      keys.push(key)
    }
    if (keys.length === 0) continue
    out.push({
      label,
      displayName: nameMatch?.[1] ?? label,
      layout: normalizeLayout({ name: nameMatch?.[1] ?? label, keys, source: 'zmk-physical-layout', origin }),
    })
  }
  return out
}

/** Serialize a layout back to a `zmk,physical-layout` node (centi-units). */
export function toZmkPhysicalLayoutDtsi(layout: PhysicalLayout, label: string, transformLabel?: string): string {
  const c = (n: number) => {
    const v = Math.round(n * 100)
    return v < 0 ? `(${v})` : String(v)
  }
  const rows = layout.keys.map(k => {
    const parts = [
      c(k.w ?? 1), c(k.h ?? 1), c(k.x), c(k.y), c(k.r ?? 0), c(k.rx ?? 0), c(k.ry ?? 0),
    ]
    return `<&key_physical_attrs ${parts.map(p => p.padStart(5)).join(' ')}>`
  })
  return [
    '#include <physical_layouts.dtsi>',
    '',
    '/ {',
    `    ${label}: ${label} {`,
    '        compatible = "zmk,physical-layout";',
    `        display-name = "${layout.name.replace(/"/g, '')}";`,
    ...(transformLabel ? [`        transform = <&${transformLabel}>;`] : []),
    '',
    '        keys  //                     w   h    x    y     rot    rx    ry',
    `            = ${rows[0]}`,
    ...rows.slice(1).map(r => `            , ${r}`),
    '            ;',
    '    };',
    '};',
    '',
  ].join('\n')
}
