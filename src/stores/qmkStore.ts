import { create } from 'zustand'
import { readText, saveText } from '../lib/io'
import { parseQMKViaJson, toVIARaw, type QMKKeymap } from '../lib/qmkParser'

const QMK_PATH = '/Users/tomkwon/Documents/splitkey2/corne_procyon/corne_procyon.layout.json'

interface QMKState {
  keymap: QMKKeymap | null
  filePath: string
  isDirty: boolean
  loadError: string | null

  load: () => Promise<void>
  updateLayerKey: (layerIndex: number, keyPos: number, newKeycode: string) => void
  save: () => Promise<void>
  setDirty: (v: boolean) => void
}

export const useQMKStore = create<QMKState>((set, get) => ({
  keymap: null,
  filePath: QMK_PATH,
  isDirty: false,
  loadError: null,

  load: async () => {
    try {
      const text = await readText(QMK_PATH)
      const km = parseQMKViaJson(text)
      set({ keymap: km, isDirty: false, loadError: null })
    } catch (err) {
      set({ loadError: String(err) })
    }
  },

  updateLayerKey: (layerIndex, keyPos, newKeycode) =>
    set((state) => {
      if (!state.keymap) return state
      const layers = state.keymap.layers.map((layer, i) => {
        if (i !== layerIndex) return layer
        const newKeys = [...layer.keys]
        newKeys[keyPos] = newKeycode
        return { ...layer, keys: newKeys }
      })
      return { keymap: { ...state.keymap, layers }, isDirty: true }
    }),

  save: async () => {
    const { keymap, filePath } = get()
    if (!keymap) return
    const raw = toVIARaw(keymap)
    // If the file can't be re-read, abort: writing only `layers` into an
    // empty object would silently drop every other VIA field.
    const json = JSON.parse(await readText(filePath))
    json.layers = raw
    const out = JSON.stringify(json, null, 2)
    await saveText(filePath, out, {
      validate: (o) => {
        try {
          const parsed = JSON.parse(o)
          return Array.isArray(parsed.layers) && parsed.layers.length === raw.length ? null : 'layer array mismatch'
        } catch (e) { return `output is not JSON: ${e}` }
      },
    })
    set({ isDirty: false })
  },

  setDirty: (v) => set({ isDirty: v }),
}))
