/**
 * ZMK keymap parsing and minimal-diff editing.
 *
 * Since Phase 2 this is a thin facade over the devicetree-CST implementation
 * in `lib/dt/keymap.ts` (web-tree-sitter + tree-sitter-devicetree). The
 * parser must be initialised once with `initDevicetree` (App.tsx does this
 * with Vite asset URLs; tests do it in tests/setup.ts) — after that every
 * function here is synchronous.
 */
export type { ZMKCombo, ZMKLayer, ZMKKeymap } from './dt/keymap'
export {
  parseKeymapText,
  generateCombosBlock,
  updateLayerBindingsInSource,
  updateCombosInSource,
  addLayerToSource,
  renameLayerInSource,
  deleteLayerFromSource,
} from './dt/keymap'
export { initDevicetree, isDevicetreeReady } from './dt/runtime'
