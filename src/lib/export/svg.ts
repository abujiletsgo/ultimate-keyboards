/**
 * Keymap → SVG: one board per layer drawn on the keyboard's physical layout,
 * with key labels, behavior sub-labels, and optional combo overlays. Plain
 * inline SVG (no fonts, no external assets) so it prints and embeds anywhere.
 */
import { layoutBounds, type PhysicalLayout } from '@/lib/layout'
import { bindingLabel, bindingSubLabel } from '@/lib/keyLabel'
import type { ZMKCombo, ZMKLayer } from '@/lib/zmkParser'

export interface SvgOptions {
  /** px per key unit */
  unit?: number
  gap?: number
  /** draw combos as rounded overlays between their keys */
  combos?: ZMKCombo[]
  title?: string
  dark?: boolean
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function keymapToSvg(layout: PhysicalLayout, layers: ZMKLayer[], opts: SvgOptions = {}): string {
  const U = opts.unit ?? 56, G = opts.gap ?? 4, PAD = 0.2
  const dark = opts.dark ?? true
  const b = layoutBounds(layout)
  const boardW = (b.maxX - b.minX + PAD * 2) * (U + G)
  const boardH = (b.maxY - b.minY + PAD * 2) * (U + G)
  const titleH = 28
  const layerGap = 24
  const totalW = boardW + 32
  const totalH = layers.length * (boardH + titleH + layerGap) + 16
  const bg = dark ? '#0a0c16' : '#ffffff'
  const board = dark ? '#161a2e' : '#f3f4f8'
  const key = dark ? '#252a44' : '#ffffff'
  const keyStroke = dark ? '#3a4066' : '#c9cdd8'
  const text = dark ? '#e2e6ff' : '#1a1d2e'
  const sub = dark ? '#8f96c4' : '#6b7190'
  const accent = '#2dd4bf'
  const px = (u: number) => u * (U + G)

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" font-family="-apple-system, Helvetica, Arial, sans-serif">`)
  parts.push(`<rect width="${totalW}" height="${totalH}" fill="${bg}"/>`)
  if (opts.title) parts.push(`<title>${esc(opts.title)}</title>`)

  layers.forEach((layer, li) => {
    const oy = 16 + li * (boardH + titleH + layerGap)
    parts.push(`<text x="16" y="${oy + 18}" fill="${text}" font-size="14" font-weight="600">${li} · ${esc(layer.displayName ?? layer.name)}</text>`)
    const by = oy + titleH
    parts.push(`<rect x="16" y="${by}" width="${boardW}" height="${boardH}" rx="14" fill="${board}"/>`)
    const centers: { x: number; y: number }[] = []
    layout.keys.forEach((k, pos) => {
      const w = k.w ?? 1, h = k.h ?? 1
      const x = 16 + px(k.x - b.minX + PAD), y = by + px(k.y - b.minY + PAD)
      const kw = w * U + (w - 1) * G, kh = h * U + (h - 1) * G
      centers.push({ x: x + kw / 2, y: y + kh / 2 })
      const binding = layer.keys[pos] ?? '&trans'
      const label = k.encoder ? '◎' : bindingLabel(binding)
      const subl = k.encoder ? '' : bindingSubLabel(binding) ?? ''
      const dashed = binding === '&trans' || binding === '&none' || !!k.encoder
      const rot = k.r ? ` transform="rotate(${k.r} ${16 + px((k.rx ?? k.x) - b.minX + PAD)} ${by + px((k.ry ?? k.y) - b.minY + PAD)})"` : ''
      parts.push(`<g${rot}>`)
      parts.push(`<rect x="${x}" y="${y}" width="${kw}" height="${kh}" rx="8" fill="${key}" stroke="${keyStroke}" stroke-width="1"${dashed ? ' stroke-dasharray="3 3" fill-opacity="0.35"' : ''}/>`)
      const fs = label.length <= 3 ? 13 : label.length <= 5 ? 11 : 9
      parts.push(`<text x="${x + kw / 2}" y="${y + kh / 2 + (subl ? 2 : 5)}" text-anchor="middle" fill="${dashed ? sub : text}" font-size="${fs}" font-weight="500">${esc(label)}</text>`)
      if (subl) parts.push(`<text x="${x + kw / 2}" y="${y + kh - 7}" text-anchor="middle" fill="${accent}" font-size="7" letter-spacing="0.4">${esc(subl.toUpperCase())}</text>`)
      parts.push('</g>')
    })
    // combos: a pill at the centroid of the trigger keys, labelled with the output
    for (const c of opts.combos ?? []) {
      if (c.layers && !c.layers.includes(li)) continue
      const pts = c.keyPositions.map(p => centers[p]).filter(Boolean)
      if (pts.length < 2) continue
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
      const lbl = bindingLabel(c.bindings)
      const wpill = Math.max(26, lbl.length * 7 + 10)
      for (const p of pts) parts.push(`<line x1="${p.x}" y1="${p.y}" x2="${cx}" y2="${cy}" stroke="${accent}" stroke-width="1" stroke-opacity="0.5"/>`)
      parts.push(`<rect x="${cx - wpill / 2}" y="${cy - 9}" width="${wpill}" height="18" rx="9" fill="${accent}"/>`)
      parts.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#04110f" font-size="9" font-weight="700">${esc(lbl)}</text>`)
    }
  })
  parts.push('</svg>')
  return parts.join('\n')
}
