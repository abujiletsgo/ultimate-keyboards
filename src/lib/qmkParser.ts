import type { PhysicalLayout } from './layout/types'

export interface QMKLayer {
  index: number
  name: string
  keys: string[] // one entry per physical-layout position
}

export interface QMKKeymap {
  layers: QMKLayer[]
  rawLayers: string[][] // layers as stored in the file (matrix order for VIA exports)
  /** layout position → index in rawLayers[i] */
  map: number[]
}

// Mapping from CORNE_PROCYON_LAYOUT pos (0-43) to VIA raw index (0-47)
const LAYOUT_TO_VIA = [
  0, 1, 2, 3, 4, 5,
  24, 25, 26, 27, 28, 29,
  6, 7, 8, 9, 10, 11,
  30, 31, 32, 33, 34, 35,
  12, 13, 14, 15, 16, 17,
  36, 37, 38, 39, 40, 41,
  20, 21, 22, 23,
  42, 43, 44, 45,
]

// names the owner's Corne Procyon used before the registry; only applied to that legacy shape
const LAYER_NAMES = ['QWERTY', 'Numbers', 'Numpad+Media', 'Gesture', 'Settings']
const LAYER_NAMES_LEGACY = true

interface VIAJson {
  name?: string
  layers: string[][]
}

/**
 * Which raw index holds each layout position.
 * - QMK Configurator keymap.json (`layout` field) and any file whose layers
 *   already have one entry per layout key: identity.
 * - VIA export (matrix order, rows × cols): row * cols + col from the layout's
 *   matrix positions, with cols = entries / rows.
 * - The 44-key Corne Procyon legacy layout (no matrix data): its fixed table.
 */
export function layoutToRawMap(rawLen: number, layout?: PhysicalLayout, configurator = false): number[] {
  const n = layout?.keys.length ?? rawLen
  if (configurator || rawLen === n) return Array.from({ length: n }, (_, i) => i)
  const keys = layout?.keys ?? []
  if (keys.length && keys.every(k => k.row !== undefined && k.col !== undefined)) {
    const rows = Math.max(...keys.map(k => k.row!)) + 1
    const cols = rawLen % rows === 0 ? rawLen / rows : Math.max(...keys.map(k => k.col!)) + 1
    return keys.map(k => k.row! * cols + k.col!)
  }
  if (rawLen === 48 && n === 44) return LAYOUT_TO_VIA
  // unknown shape: show the first n entries in file order rather than guessing
  return Array.from({ length: Math.min(n, rawLen) }, (_, i) => i)
}

export function parseQMKViaJson(jsonText: string, layout?: PhysicalLayout): QMKKeymap {
  const parsed: VIAJson & { layout?: string } = JSON.parse(jsonText)
  const rawLayers = parsed.layers ?? []
  const map = layoutToRawMap(rawLayers[0]?.length ?? 0, layout, typeof parsed.layout === 'string')
  const layers: QMKLayer[] = rawLayers.map((raw, i) => ({
    index: i,
    name: LAYER_NAMES_LEGACY && map === LAYOUT_TO_VIA ? (LAYER_NAMES[i] ?? `Layer ${i}`) : `Layer ${i}`,
    keys: map.map(idx => raw[idx] ?? 'KC_NO'),
  }))
  return { layers, rawLayers, map }
}

export function toVIARaw(keymap: QMKKeymap): string[][] {
  return keymap.layers.map((layer, layerIdx) => {
    const raw = [...(keymap.rawLayers[layerIdx] ?? Array(Math.max(...keymap.map, 0) + 1).fill('KC_NO'))]
    keymap.map.forEach((rawIdx, pos) => { raw[rawIdx] = layer.keys[pos] ?? 'KC_NO' })
    return raw
  })
}
