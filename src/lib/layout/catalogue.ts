/**
 * Bundled layout catalogue (built by scripts/build-catalogue.ts from ZMK's
 * shared physical layouts). Used when a config repo carries no physical
 * layout of its own, and as the picker in Settings.
 */
import raw from './catalogue/zmk-layouts.json'
import type { PhysicalLayout } from './types'

export interface CatalogueEntry {
  id: string
  vendor: string
  board: string
  variant: string
  displayName: string
  keyCount: number
  aliases: string[]
  layout: PhysicalLayout
}

export const CATALOGUE: CatalogueEntry[] = (raw as CatalogueEntry[]).map(e => ({
  ...e,
  layout: { ...e.layout, source: 'catalogue', origin: e.id },
}))

/** Human label: "Corne · 6 Column (42 keys)". */
export function catalogueLabel(e: CatalogueEntry): string {
  const board = e.board.replace(/_/g, ' ')
  const name = board.charAt(0).toUpperCase() + board.slice(1)
  return `${name} · ${e.displayName} (${e.keyCount} keys)`
}

/**
 * Best catalogue match for a shield / keyboard name and a key count.
 * "corne_tp_left" → corne; "crosses" → none (returns null).
 */
export function findCatalogueLayout(shieldName: string | undefined, keyCount?: number): CatalogueEntry | null {
  if (!shieldName) return null
  const base = shieldName.toLowerCase().replace(/_(left|right|dongle|central|peripheral)$/, '')
  const tokens = new Set(base.split(/[_-]/).filter(Boolean))
  tokens.add(base)
  let best: CatalogueEntry | null = null
  let bestScore = 0
  for (const e of CATALOGUE) {
    let score = 0
    for (const a of e.aliases) {
      if (a === base) score = Math.max(score, 3)
      else if (tokens.has(a)) score = Math.max(score, 2)
      else if (base.includes(a) && a.length >= 4) score = Math.max(score, 1)
    }
    if (score === 0) continue
    if (keyCount !== undefined && e.keyCount === keyCount) score += 2
    if (score > bestScore) { best = e; bestScore = score }
  }
  return best
}

export function catalogueByKeyCount(keyCount: number): CatalogueEntry[] {
  return CATALOGUE.filter(e => e.keyCount === keyCount)
}
