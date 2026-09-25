/** Tiny static picture of a physical layout (cards, lists). One SVG, no per-key DOM. */
import type { PhysicalLayout } from '@/lib/layout'

export default function MiniLayout({ layout, width = 180, color = 'rgba(226,230,255,0.35)' }: { layout: PhysicalLayout; width?: number; color?: string }) {
  const keys = layout.keys.filter(k => !k.hidden)
  if (!keys.length) return null
  // bounds including rotation (approximate with the rotated corners)
  const pts: [number, number][] = []
  for (const k of keys) {
    const w = k.w ?? 1, h = k.h ?? 1
    const corners: [number, number][] = [[k.x, k.y], [k.x + w, k.y], [k.x, k.y + h], [k.x + w, k.y + h]]
    for (const [x, y] of corners) {
      if (k.r) {
        const rx = k.rx ?? k.x, ry = k.ry ?? k.y, a = (k.r * Math.PI) / 180
        pts.push([rx + (x - rx) * Math.cos(a) - (y - ry) * Math.sin(a), ry + (x - rx) * Math.sin(a) + (y - ry) * Math.cos(a)])
      } else pts.push([x, y])
    }
  }
  const minX = Math.min(...pts.map(p => p[0])), minY = Math.min(...pts.map(p => p[1]))
  const maxX = Math.max(...pts.map(p => p[0])), maxY = Math.max(...pts.map(p => p[1]))
  const vw = maxX - minX, vh = maxY - minY
  return (
    <svg viewBox={`${minX - 0.1} ${minY - 0.1} ${vw + 0.2} ${vh + 0.2}`} width={width} height={(width * (vh + 0.2)) / (vw + 0.2)} aria-hidden style={{ display: 'block' }}>
      {keys.map((k, i) => (
        <rect
          key={i} x={k.x + 0.06} y={k.y + 0.06} width={(k.w ?? 1) - 0.12} height={(k.h ?? 1) - 0.12} rx={0.15}
          fill={color}
          transform={k.r ? `rotate(${k.r} ${k.rx ?? k.x} ${k.ry ?? k.y})` : undefined}
        />
      ))}
    </svg>
  )
}
