export interface QMKLayer {
  index: number
  name: string
  keys: string[] // 44 entries in LAYOUT order (pos 0-43)
}

export interface QMKKeymap {
  layers: QMKLayer[]
  rawLayers: string[][] // original 48-entry arrays from VIA JSON
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

const LAYER_NAMES = ['QWERTY', 'Numbers', 'Numpad+Media', 'Gesture', 'Settings']

interface VIAJson {
  name?: string
  layers: string[][]
}

export function parseQMKViaJson(jsonText: string): QMKKeymap {
  const parsed: VIAJson = JSON.parse(jsonText)
  const rawLayers = parsed.layers ?? []

  const layers: QMKLayer[] = rawLayers.map((raw, i) => ({
    index: i,
    name: LAYER_NAMES[i] ?? `Layer ${i}`,
    keys: LAYOUT_TO_VIA.map(viaIdx => raw[viaIdx] ?? 'KC_NO'),
  }))

  return { layers, rawLayers }
}

export function toVIARaw(keymap: QMKKeymap): string[][] {
  // Convert 44-entry LAYOUT layers back to 48-entry VIA raw format
  return keymap.layers.map((layer, layerIdx) => {
    const raw = [...(keymap.rawLayers[layerIdx] ?? Array(48).fill('KC_NO'))]
    LAYOUT_TO_VIA.forEach((viaIdx, layoutPos) => {
      raw[viaIdx] = layer.keys[layoutPos] ?? 'KC_NO'
    })
    return raw
  })
}
