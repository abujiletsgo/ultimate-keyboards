import { create } from 'zustand'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
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
      const text = await readTextFile(QMK_PATH)
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
    const json = JSON.parse(await readTextFile(filePath).catch(() => '{}'))
    json.layers = raw
    await writeTextFile(filePath, JSON.stringify(json, null, 2))
    set({ isDirty: false })
  },

  setDirty: (v) => set({ isDirty: v }),
}))
