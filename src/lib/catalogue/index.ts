/**
 * One searchable list of keyboards a new owner can start from:
 * - ZMK: bundled from zmkfirmware/zmk (MIT) by scripts/build-keyboards.ts —
 *   layout, features and default keymap, offline.
 * - QMK: popular split keyboards by name, bundled; any other QMK keyboard is
 *   searched in QMK's online list. Layout and default keymap are downloaded
 *   when opened (see ./qmk.ts).
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
  /** null when unknown (a QMK keyboard from the online list, until opened) */
  split: boolean | null
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
  /** only keyboards known to be split */
  split: boolean
  tags: Tag[]
}

export const EMPTY_FILTER: CatalogueFilter = { query: '', firmware: 'any', split: false, tags: [] }

export function filterCatalogue(items: CatalogueItem[], f: CatalogueFilter): CatalogueItem[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(i =>
    (f.firmware === 'any' || i.firmware === f.firmware) &&
    (!f.split || i.split === true) &&
    f.tags.every(t => i.tags.includes(t)) &&
    words.every(w => i.haystack.includes(w) || (/^\d+$/.test(w) && i.keyCount === Number(w))),
  ).sort((a, b) => a.name.localeCompare(b.name) || a.firmware.localeCompare(b.firmware))
}

export const RELIABILITY_LABEL: Record<Reliability, { label: string; hint: string }> = {
  official: { label: 'Official ZMK default', hint: 'Layout and keymap come from the ZMK project itself.' },
  approximate: { label: 'Approximate layout', hint: 'ZMK has no physical layout for this keyboard, so keys are drawn on a grid. The keymap itself is official.' },
  online: { label: 'From QMK (online)', hint: 'Layout and default keymap are downloaded from QMK when you open it.' },
}

/** Whether a filter can match keyboards from QMK's online list: those carry no tags and no split flag until opened. */
export function wantsQmkOnline(f: CatalogueFilter): boolean {
  return f.query.trim().length >= 2 && f.firmware !== 'zmk' && !f.split && f.tags.length === 0
}

/** `keychron/q1v2/ansi_encoder` → `Keychron Q1v2 Ansi Encoder`; revision folders dropped. */
export function qmkPathName(path: string): string {
  return path.split('/').filter(s => !/^rev\w*$|^v\d+$/i.test(s)).join(' ')
    .replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * QMK keyboards from the online list (`qmkKeyboardList()`) that match the
 * query and are not already in the bundled list. Every query word must
 * appear in the path or its readable name. At most `limit` items.
 */
export function qmkOnlineMatches(list: string[], f: CatalogueFilter, bundled: CatalogueItem[], limit = 60): { items: CatalogueItem[]; total: number } {
  if (!wantsQmkOnline(f)) return { items: [], total: 0 }
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean)
  const have = new Set(bundled.filter(i => i.qmkPath).map(i => i.qmkPath))
  const hits = list.filter(p => {
    if (have.has(p)) return false
    const hay = `${p} ${qmkPathName(p)}`.toLowerCase()
    return words.every(w => hay.includes(w))
  }).sort((a, b) => a.localeCompare(b))
  return {
    total: hits.length,
    items: hits.slice(0, limit).map((p): CatalogueItem => ({
      key: `qmk:${p}`, name: qmkPathName(p), firmware: 'qmk', split: null, keyCount: null, tags: [],
      reliability: 'online', qmkPath: p, haystack: `${p} qmk`.toLowerCase(),
    })),
  }
}
