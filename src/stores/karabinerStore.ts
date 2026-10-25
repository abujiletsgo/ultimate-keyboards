import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { Rule, generateComplexModification } from '../lib/karabinerGenerator';

import { cloneMacProfile, sameMacProfile, macLayerNames, layerNameError, renameMacLayer, deleteMacLayer, MAC_HISTORY_LIMIT, type MacProfileSnapshot } from '../lib/macLayerEditing';

export interface KarabinerState {
  rules: Rule[];
  profileTitle: string;
  layerNames: string[];
  savedSnapshot: MacProfileSnapshot;
  isDirty: boolean;
  past: MacProfileSnapshot[];
  future: MacProfileSnapshot[];
  saveProfile: () => void;
  revertProfile: () => void;
  undo: () => void;
  redo: () => void;
  addLayer: (name: string) => string | null;
  renameLayer: (from: string | null, to: string) => string | null;
  deleteLayer: (name: string | null) => string | null;
  replaceRules: (rules: Rule[]) => void;
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

const EMPTY_PROFILE: MacProfileSnapshot = { rules: [], profileTitle: 'Ultimate Keyboards', layerNames: [] };

/** A separate store factory keeps persistence/migration tests isolated from user data. */
export function createKarabinerStore(storage?: StateStorage) {
  return create<KarabinerState>()(persist((set, get) => {
    const snapshot = () => cloneMacProfile(get());
    const edit = (next: MacProfileSnapshot) => {
      const current = snapshot();
      if (sameMacProfile(current, next)) return;
      set({ ...cloneMacProfile(next), isDirty: !sameMacProfile(next, get().savedSnapshot),
        past: [...get().past.slice(-(MAC_HISTORY_LIMIT - 1)), current], future: [] });
    };
    const layerEdit = (action: () => MacProfileSnapshot): string | null => {
      try { edit(action()); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
    };
    return {
      ...cloneMacProfile(EMPTY_PROFILE), savedSnapshot: cloneMacProfile(EMPTY_PROFILE), isDirty: false, past: [], future: [],
      replaceRules: rules => edit({ ...snapshot(), rules: structuredClone(rules) }),
      addRule: r => edit({ ...snapshot(), rules: [...get().rules, structuredClone(r)] }),
      removeRule: idx => edit({ ...snapshot(), rules: get().rules.filter((_, i) => i !== idx) }),
      updateRule: (idx, r) => edit({ ...snapshot(), rules: get().rules.map((rule, i) => i === idx ? structuredClone(r) : rule) }),
      setTitle: profileTitle => edit({ ...snapshot(), profileTitle }),
      loadExample: () => edit({ ...snapshot(), rules: structuredClone(EXAMPLE_RULES), layerNames: macLayerNames(EXAMPLE_RULES) }),
      moveRule: (idx, delta) => {
        const j = idx + delta;
        if (idx < 0 || idx >= get().rules.length || j < 0 || j >= get().rules.length) return;
        const rules = [...get().rules];
        [rules[idx], rules[j]] = [rules[j], rules[idx]];
        edit({ ...snapshot(), rules });
      },
      addLayer: name => layerEdit(() => {
        const current = snapshot();
        const names = macLayerNames(current.rules, current.layerNames);
        const error = layerNameError(name, names);
        if (error) throw new Error(error);
        return { ...current, layerNames: [...names, name] };
      }),
      renameLayer: (from, to) => layerEdit(() => renameMacLayer(snapshot(), from, to)),
      deleteLayer: name => layerEdit(() => deleteMacLayer(snapshot(), name)),
      saveProfile: () => {
        const prior = { savedSnapshot: get().savedSnapshot, isDirty: get().isDirty, past: get().past, future: get().future };
        try { set({ savedSnapshot: snapshot(), isDirty: false, past: [], future: [] }); }
        catch (error) {
          // A failed local-storage write must not claim that the draft was saved.
          try { set(prior); } catch { /* in-memory rollback still happened before middleware writes */ }
          throw error;
        }
      },
      revertProfile: () => set({ ...cloneMacProfile(get().savedSnapshot), isDirty: false, past: [], future: [] }),
      undo: () => {
        const previous = get().past.at(-1); if (!previous) return;
        set({ ...cloneMacProfile(previous), isDirty: !sameMacProfile(previous, get().savedSnapshot),
          past: get().past.slice(0, -1), future: [snapshot(), ...get().future] });
      },
      redo: () => {
        const next = get().future[0]; if (!next) return;
        set({ ...cloneMacProfile(next), isDirty: !sameMacProfile(next, get().savedSnapshot),
          past: [...get().past.slice(-(MAC_HISTORY_LIMIT - 1)), snapshot()], future: get().future.slice(1) });
      },
      exportJSON: () => JSON.stringify(generateComplexModification(get().rules, get().profileTitle), null, 2),
    };
  }, {
    name: 'uk.karabiner',
    storage: storage ? createJSONStorage(() => storage) : createJSONStorage(() => localStorage),
    // Retain the working draft for crash recovery; history is session-only.
    partialize: s => ({ rules: s.rules, profileTitle: s.profileTitle, layerNames: s.layerNames, savedSnapshot: s.savedSnapshot }),
    merge: (persisted, current) => {
      const data = persisted as Partial<MacProfileSnapshot> & { savedSnapshot?: MacProfileSnapshot } | undefined;
      if (!data) return current;
      const draft = cloneMacProfile({ rules: data.rules ?? current.rules, profileTitle: data.profileTitle ?? current.profileTitle, layerNames: data.layerNames ?? [] });
      // Existing profiles are initially saved, including unknown rule fields.
      const savedSnapshot = cloneMacProfile(data.savedSnapshot ?? draft);
      return { ...current, ...draft, savedSnapshot, past: [], future: [], isDirty: !sameMacProfile(draft, savedSnapshot) };
    },
  }));
}
export const useKarabinerStore = createKarabinerStore();
