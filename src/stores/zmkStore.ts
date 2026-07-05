import { create } from 'zustand';
import type { ZMKCombo, ZMKKeymap } from '../lib/zmkParser';

interface ZMKState {
  keymap: ZMKKeymap | null;
  filePath: string | null;
  isDirty: boolean;
  /** Persisted across section switches so returning users keep their place */
  selectedLayer: number;

  // Actions
  setKeymap: (km: ZMKKeymap | null, path: string) => void;
  setSelectedLayer: (idx: number) => void;
  addCombo: (combo: ZMKCombo) => void;
  updateCombo: (name: string, updated: ZMKCombo) => void;
  deleteCombo: (name: string) => void;
  setDirty: (value: boolean) => void;
  updateLayerKey: (layerIndex: number, keyPos: number, newBinding: string) => void;
}

export const useZMKStore = create<ZMKState>((set) => ({
  keymap: null,
  filePath: null,
  isDirty: false,
  selectedLayer: 0,

  setKeymap: (km, path) =>
    set({ keymap: km, filePath: path, isDirty: false }),

  setSelectedLayer: (idx) => set({ selectedLayer: idx }),

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
