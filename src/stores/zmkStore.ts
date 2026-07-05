import { create } from 'zustand';
import type { ZMKCombo, ZMKKeymap } from '../lib/zmkParser';
import {
  addLayerToSource,
  parseKeymapText,
  updateCombosInSource,
  updateLayerBindingsInSource,
} from '../lib/zmkParser';

interface ZMKState {
  keymap: ZMKKeymap | null;
  filePath: string | null;
  isDirty: boolean;
  /** Persisted across section switches so returning users keep their place */
  selectedLayer: number;

  // Actions
  setKeymap: (km: ZMKKeymap | null, path: string) => void;
  setSelectedLayer: (idx: number) => void;
  /** Append a new all-&trans layer; returns its index, or -1 on failure */
  addLayer: (name: string) => number;
  addCombo: (combo: ZMKCombo) => void;
  updateCombo: (name: string, updated: ZMKCombo) => void;
  deleteCombo: (name: string) => void;
  setDirty: (value: boolean) => void;
  updateLayerKey: (layerIndex: number, keyPos: number, newBinding: string) => void;
}

export const useZMKStore = create<ZMKState>((set, get) => ({
  keymap: null,
  filePath: null,
  isDirty: false,
  selectedLayer: 0,

  setKeymap: (km, path) =>
    set({ keymap: km, filePath: path, isDirty: false }),

  setSelectedLayer: (idx) => set({ selectedLayer: idx }),

  addLayer: (name) => {
    const { keymap } = get();
    if (!keymap) return -1;
    // Bake any unsaved edits into the source first so nothing is lost,
    // then append the new layer node and re-parse.
    const keyCount = keymap.layers[0]?.keys.length ?? 42;
    let src = updateLayerBindingsInSource(keymap.rawSource, keymap.layers);
    src = updateCombosInSource(src, keymap.combos);
    src = addLayerToSource(src, name, keyCount);
    const km = parseKeymapText(src);
    const newIndex = km.layers.length - 1;
    set({ keymap: km, isDirty: true, selectedLayer: newIndex });
    return newIndex;
  },

  addCombo: (combo) =>
    set((state) => {
      if (!state.keymap) return state;
      return {
        keymap: {
          ...state.keymap,
          combos: [...state.keymap.combos, combo],
        },
        isDirty: true,
      };
    }),

  updateCombo: (name, updated) =>
    set((state) => {
      if (!state.keymap) return state;
      return {
        keymap: {
          ...state.keymap,
          combos: state.keymap.combos.map((c) =>
            c.name === name ? updated : c,
          ),
        },
        isDirty: true,
      };
    }),

  deleteCombo: (name) =>
    set((state) => {
      if (!state.keymap) return state;
      return {
        keymap: {
          ...state.keymap,
          combos: state.keymap.combos.filter((c) => c.name !== name),
        },
        isDirty: true,
      };
    }),

  setDirty: (value) => set({ isDirty: value }),

  updateLayerKey: (layerIndex, keyPos, newBinding) =>
    set((state) => {
      if (!state.keymap) return state;
      const layers = state.keymap.layers.map((layer, i) => {
        if (i !== layerIndex) return layer;
        const newKeys = [...layer.keys];
        newKeys[keyPos] = newBinding;
        return { ...layer, keys: newKeys };
      });
      return { keymap: { ...state.keymap, layers }, isDirty: true };
    }),
}));
