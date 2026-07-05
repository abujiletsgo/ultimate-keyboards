import { create } from 'zustand';
import type { ZMKCombo, ZMKKeymap } from '../lib/zmkParser';
import {
  addLayerToSource,
  deleteLayerFromSource,
  parseKeymapText,
  renameLayerInSource,
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
  /** Rename a layer node (+display-name); returns error message or null */
  renameLayer: (index: number, newName: string) => string | null;
  /** Delete a layer; blocks if referenced, renumbers higher refs. Returns error or null */
  deleteLayer: (index: number) => string | null;
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

  renameLayer: (index, newName) => {
    const { keymap, selectedLayer } = get();
    if (!keymap) return 'No keymap loaded';
    const layer = keymap.layers[index];
    if (!layer) return 'Layer not found';
    if (!/^\w[\w+]*$/.test(newName)) return 'Name must be letters/digits/underscore';
    if (keymap.layers.some((l, i) => i !== index && (l.name === newName || l.displayName === newName)))
      return `Layer "${newName}" already exists`;
    let src = updateLayerBindingsInSource(keymap.rawSource, keymap.layers);
    src = updateCombosInSource(src, keymap.combos);
    src = renameLayerInSource(src, layer.name, newName);
    const km = parseKeymapText(src);
    set({ keymap: km, isDirty: true, selectedLayer });
    return null;
  },

  deleteLayer: (index) => {
    const { keymap } = get();
    if (!keymap) return 'No keymap loaded';
    if (keymap.layers.length <= 1) return 'Cannot delete the last layer';
    const layer = keymap.layers[index];
    if (!layer) return 'Layer not found';

    // Find references to this layer in bindings (&mo/&lt/&tog/&sl/&to N)
    const refRe = /^&(mo|lt|tog|sl|to)\s+(\d+)/;
    for (const l of keymap.layers) {
      for (const key of l.keys) {
        const m = refRe.exec(key);
        if (m && parseInt(m[2], 10) === index) {
          return `Layer ${index} is referenced by "${key}" on layer "${l.displayName ?? l.name}" — rebind it first`;
        }
      }
    }
    for (const c of keymap.combos) {
      if (c.layers?.includes(index)) {
        return `Layer ${index} is used by combo "${c.name}" — edit its layer filter first`;
      }
      const m = refRe.exec(c.bindings);
      if (m && parseInt(m[2], 10) === index) {
        return `Layer ${index} is referenced by combo "${c.name}" — rebind it first`;
      }
    }

    // Renumber references to layers above the deleted one
    const renumber = (binding: string): string =>
      binding.replace(/^(&(?:mo|lt|tog|sl|to)\s+)(\d+)/, (_, pre: string, num: string) => {
        const n = parseInt(num, 10);
        return n > index ? `${pre}${n - 1}` : `${pre}${num}`;
      });

    const newLayers = keymap.layers
      .filter((_, i) => i !== index)
      .map(l => ({ ...l, keys: l.keys.map(renumber) }));
    const newCombos = keymap.combos.map(c => ({
      ...c,
      bindings: renumber(c.bindings),
      layers: c.layers?.map(n => (n > index ? n - 1 : n)),
    }));

    // Bake current state, remove the node, apply renumbered data, re-parse
    let src = updateLayerBindingsInSource(keymap.rawSource, keymap.layers);
    src = updateCombosInSource(src, keymap.combos);
    src = deleteLayerFromSource(src, layer.name);
    src = updateLayerBindingsInSource(src, newLayers);
    src = updateCombosInSource(src, newCombos);
    const km = parseKeymapText(src);
    set({
      keymap: km,
      isDirty: true,
      selectedLayer: Math.min(get().selectedLayer, km.layers.length - 1),
    });
    return null;
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
