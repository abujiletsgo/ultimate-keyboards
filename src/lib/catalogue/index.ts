/**
 * One searchable list of keyboards a new owner can start from:
 * - ZMK: bundled from zmkfirmware/zmk (MIT) by scripts/build-keyboards.ts —
 *   layout, features and default keymap, offline.
 * - QMK: popular split keyboards by name; layout and default keymap are
 *   downloaded when opened (see ./qmk.ts).
 */
import raw from './zmk-keyboards.json'
import type { PhysicalLayout } from '@/lib/layout'
import { QMK_POPULAR } from './qmk'

export interface ZmkCatalogueKeyboard {
  id: string
  name: string
  type: 'shield' | 'board'
  url?: string
  requires: string[]
  features: string[]
  siblings: string[]
  studio: boolean
  keyCount: number
  layout: PhysicalLayout
  keymap: string
  keymapPreview: boolean
  gridLayout: boolean
  layerNames: string[]
  path: string
}

export type Reliability = 'official' | 'approximate' | 'online'

export interface CatalogueItem {
  key: string
  name: string
  firmware: 'zmk' | 'qmk'
  split: boolean
  /** unknown for QMK until details are downloaded */
  keyCount: number | null
  tags: Tag[]
  reliability: Reliability
  zmk?: ZmkCatalogueKeyboard
  qmkPath?: string
  /** lower-case text searched by the query box */
  haystack: string
}

export type Tag = 'trackball' | 'trackpad' | 'rgb' | 'display' | 'encoder' | 'studio'
export const TAG_LABEL: Record<Tag, string> = {
  trackball: 'Trackball', trackpad: 'Trackpad', rgb: 'RGB', display: 'Display', encoder: 'Knob', studio: 'Live edit (Studio)',
}

export const ZMK_KEYBOARDS = raw as ZmkCatalogueKeyboard[]

function zmkTags(k: ZmkCatalogueKeyboard): Tag[] {
  const t: Tag[] = []
  if (k.features.includes('underglow') || k.features.includes('backlight')) t.push('rgb')
  if (k.features.includes('display')) t.push('display')
  if (k.features.includes('encoder')) t.push('encoder')
  if (k.studio) t.push('studio')
  return t
}

export const CATALOGUE_ITEMS: CatalogueItem[] = [
  ...ZMK_KEYBOARDS.map((k): CatalogueItem => ({
    key: `zmk:${k.id}`,
    name: k.name,
    firmware: 'zmk',
    split: k.siblings.length > 0,
    keyCount: k.keyCount,
    tags: zmkTags(k),
    reliability: k.gridLayout ? 'approximate' : 'official',
    zmk: k,
    haystack: `${k.name} ${k.id} zmk ${k.requires.join(' ')}`.toLowerCase(),
  })),
  ...QMK_POPULAR.map((q): CatalogueItem => ({
    key: `qmk:${q.path}`,
    name: q.name,
    firmware: 'qmk',
    split: true,
    keyCount: null,
    tags: q.pointing ? [q.pointing] : [],
    reliability: 'online',
    qmkPath: q.path,
    haystack: `${q.name} ${q.path} qmk`.toLowerCase(),
  })),
]

export interface CatalogueFilter {
  query: string
  firmware: 'any' | 'zmk' | 'qmk'
  splitOnly: boolean
  tags: Tag[]
}

export const EMPTY_FILTER: CatalogueFilter = { query: '', firmware: 'any', splitOnly: true, tags: [] }

export function filterCatalogue(items: CatalogueItem[], f: CatalogueFilter): CatalogueItem[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(i =>
    (f.firmware === 'any' || i.firmware === f.firmware) &&
    (!f.splitOnly || i.split) &&
    f.tags.every(t => i.tags.includes(t)) &&
    words.every(w => i.haystack.includes(w) || (/^\d+$/.test(w) && i.keyCount === Number(w))),
  ).sort((a, b) => a.name.localeCompare(b.name) || a.firmware.localeCompare(b.firmware))
}

export const RELIABILITY_LABEL: Record<Reliability, { label: string; hint: string }> = {
  official: { label: 'Official ZMK default', hint: 'Layout and keymap come from the ZMK project itself.' },
  approximate: { label: 'Approximate layout', hint: 'ZMK has no physical layout for this keyboard, so keys are drawn on a grid. The keymap itself is official.' },
  online: { label: 'From QMK (online)', hint: 'Layout and default keymap are downloaded from QMK when you open it.' },
}
