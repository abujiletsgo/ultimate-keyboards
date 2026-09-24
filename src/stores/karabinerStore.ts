import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Rule, generateComplexModification } from '../lib/karabinerGenerator';

interface KarabinerState {
  rules: Rule[];
  profileTitle: string;
  addRule: (r: Rule) => void;
  removeRule: (idx: number) => void;
  updateRule: (idx: number, r: Rule) => void;
  setTitle: (t: string) => void;
  loadExample: () => void;
  /** Move a rule up (-1) or down (+1); Karabiner evaluates rules in order. */
  moveRule: (idx: number, delta: -1 | 1) => void;
  exportJSON: () => string;
}

/** Example profile (a space layer + a few combos) users can load from the empty state. */
export const EXAMPLE_RULES: Rule[] = [
  // ── Space layer ─────────────────────────────────────────────────────────────
  {
    type: 'layer_activator',
    description: 'Space: hold → Layer 1, tap → Space',
    fromKey: 'spacebar',
    layerName: 'layer1',
    tapKey: 'spacebar',
  },
  // Numbers row (top row via space layer)
  { type: 'layer_binding', description: 'Layer1 q → 1', layerName: 'layer1', fromKey: 'q', toKey: '1' },
  { type: 'layer_binding', description: 'Layer1 w → 2', layerName: 'layer1', fromKey: 'w', toKey: '2' },
  { type: 'layer_binding', description: 'Layer1 e → 3', layerName: 'layer1', fromKey: 'e', toKey: '3' },
  { type: 'layer_binding', description: 'Layer1 r → 4', layerName: 'layer1', fromKey: 'r', toKey: '4' },
  { type: 'layer_binding', description: 'Layer1 t → 5', layerName: 'layer1', fromKey: 't', toKey: '5' },
  { type: 'layer_binding', description: 'Layer1 y → 6', layerName: 'layer1', fromKey: 'y', toKey: '6' },
  { type: 'layer_binding', description: 'Layer1 u → 7', layerName: 'layer1', fromKey: 'u', toKey: '7' },
  { type: 'layer_binding', description: 'Layer1 i → 8', layerName: 'layer1', fromKey: 'i', toKey: '8' },
  { type: 'layer_binding', description: 'Layer1 o → 9', layerName: 'layer1', fromKey: 'o', toKey: '9' },
  { type: 'layer_binding', description: 'Layer1 p → 0', layerName: 'layer1', fromKey: 'p', toKey: '0' },
  // Symbols (home/bottom rows via space layer)
  { type: 'layer_binding', description: 'Layer1 a → ~', layerName: 'layer1', fromKey: 'a', toKey: 'grave_accent_and_tilde', toModifiers: ['shift'] },
  { type: 'layer_binding', description: 'Layer1 l → [', layerName: 'layer1', fromKey: 'l', toKey: 'open_bracket' },
  { type: 'layer_binding', description: 'Layer1 ; → ]', layerName: 'layer1', fromKey: 'semicolon', toKey: 'close_bracket' },
  { type: 'layer_binding', description: "Layer1 ' → \\", layerName: 'layer1', fromKey: 'quote', toKey: 'backslash' },
  { type: 'layer_binding', description: 'Layer1 z → /', layerName: 'layer1', fromKey: 'z', toKey: 'slash' },
  { type: 'layer_binding', description: 'Layer1 x → *', layerName: 'layer1', fromKey: 'x', toKey: '8', toModifiers: ['shift'] },
  { type: 'layer_binding', description: 'Layer1 c → -', layerName: 'layer1', fromKey: 'c', toKey: 'hyphen' },
  { type: 'layer_binding', description: 'Layer1 v → +', layerName: 'layer1', fromKey: 'v', toKey: 'equal_sign', toModifiers: ['shift'] },
  { type: 'layer_binding', description: 'Layer1 b → =', layerName: 'layer1', fromKey: 'b', toKey: 'equal_sign' },
  // Arrows (via space layer)
  { type: 'layer_binding', description: 'Layer1 k → ↑', layerName: 'layer1', fromKey: 'k', toKey: 'up_arrow' },
  { type: 'layer_binding', description: 'Layer1 m → ←', layerName: 'layer1', fromKey: 'm', toKey: 'left_arrow' },
  { type: 'layer_binding', description: 'Layer1 , → ↓', layerName: 'layer1', fromKey: 'comma', toKey: 'down_arrow' },
  { type: 'layer_binding', description: 'Layer1 . → →', layerName: 'layer1', fromKey: 'period', toKey: 'right_arrow' },
  // Workspace switching (via space layer)
  { type: 'layer_binding', description: 'Layer1 d → ⌃← (prev workspace)', layerName: 'layer1', fromKey: 'd', toKey: 'left_arrow', toModifiers: ['control'] },
  { type: 'layer_binding', description: 'Layer1 f → ⌃↑ (mission control)', layerName: 'layer1', fromKey: 'f', toKey: 'up_arrow', toModifiers: ['control'] },
  { type: 'layer_binding', description: 'Layer1 g → ⌃→ (next workspace)', layerName: 'layer1', fromKey: 'g', toKey: 'right_arrow', toModifiers: ['control'] },

  // ── Combos ──────────────────────────────────────────────────────────────────
  { type: 'combo', description: 'w+e → Escape', fromKeys: ['w', 'e'], toKey: 'escape' },
  { type: 'combo', description: 'u+i → ⌥+Backspace (delete word)', fromKeys: ['u', 'i'], toKey: 'delete_or_backspace', toModifiers: ['option'] },
  { type: 'combo', description: 'i+o → Backspace', fromKeys: ['i', 'o'], toKey: 'delete_or_backspace' },
  { type: 'combo', description: 'o+p → Forward Delete', fromKeys: ['o', 'p'], toKey: 'delete_forward' },
  { type: 'combo', description: 'h+j → Tab', fromKeys: ['h', 'j'], toKey: 'tab' },
  { type: 'combo', description: 'k+l → Enter', fromKeys: ['k', 'l'], toKey: 'return_or_enter' },
];

export const useKarabinerStore = create<KarabinerState>()(
  persist(
    (set, get) => ({
      rules: [],
      profileTitle: 'Ultimate Keyboards',

      addRule: (r) =>
        set((state) => ({ rules: [...state.rules, r] })),

      removeRule: (idx) =>
        set((state) => ({ rules: state.rules.filter((_, i) => i !== idx) })),

      updateRule: (idx, r) =>
        set((state) => ({ rules: state.rules.map((rule, i) => i === idx ? r : rule) })),

      setTitle: (t) => set({ profileTitle: t }),

      loadExample: () => set({ rules: EXAMPLE_RULES }),

      moveRule: (idx, delta) =>
        set((state) => {
          const j = idx + delta;
          if (j < 0 || j >= state.rules.length) return state;
          const rules = [...state.rules];
          [rules[idx], rules[j]] = [rules[j], rules[idx]];
          return { rules };
        }),

      exportJSON: () => {
        const { rules, profileTitle } = get();
        const mod = generateComplexModification(rules, profileTitle);
        return JSON.stringify(mod, null, 2);
      },
    }),
    {
      name: 'uk.karabiner',
      // Rules are user work product — losing them on reload is data loss.
      partialize: (s) => ({ rules: s.rules, profileTitle: s.profileTitle }),
    },
  ),
);
