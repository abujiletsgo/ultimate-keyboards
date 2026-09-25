import type { PhysicalLayout } from '../lib/layout/types'
import { create } from 'zustand'
import { readText, saveText } from '../lib/io'
import { parseQMKViaJson, toVIARaw, type QMKKeymap } from '../lib/qmkParser'

interface QMKState {
  keymap: QMKKeymap | null
  filePath: string | null
  isDirty: boolean
  loadError: string | null

  load: (path: string, layout?: PhysicalLayout) => Promise<void>
  updateLayerKey: (layerIndex: number, keyPos: number, newKeycode: string) => void
  save: () => Promise<void>
  setDirty: (v: boolean) => void
}

export const useQMKStore = create<QMKState>((set, get) => ({
  keymap: null,
  filePath: null,
  isDirty: false,
  loadError: null,

  load: async (path, layout) => {
    set({ filePath: path, keymap: null, loadError: null })
    try {
      const text = await readText(path)
      const km = parseQMKViaJson(text, layout)
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
    if (!keymap || !filePath) return
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
