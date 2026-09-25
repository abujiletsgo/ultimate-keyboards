/**
 * Keyboard registry store. Desktop persists through tauri-plugin-store
 * (app-data dir, survives reinstalls); the web build uses localStorage.
 *
 * A read error is reported, never treated as "no keyboards": the store is
 * then left untouched on disk so a transient failure cannot wipe it.
 */
import { create } from 'zustand'
import { IS_TAURI } from '@/lib/io'
import { LEGACY_CROSSES, LEGACY_CORNE_PROCYON, type PhysicalLayout } from '@/lib/layout'
import { EMPTY_REGISTRY, newKeyboardId, type KeyboardDef, type RegistryData } from '@/lib/registry/types'

const LS_KEY = 'uk.registry'
const STORE_FILE = 'registry.json'

// ── persistence adapter ──────────────────────────────────────────────────────

async function readPersisted(): Promise<RegistryData | null> {
  try {
    if (IS_TAURI) {
      const { load } = await import('@tauri-apps/plugin-store')
      const store = await load(STORE_FILE, { defaults: {}, autoSave: false })
      const data = await store.get<RegistryData>('registry')
      return data ?? null
    }
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as RegistryData) : null
  } catch (e) {
    throw new Error(`Could not read your keyboard list: ${e}`)
  }
}

async function writePersisted(data: RegistryData): Promise<void> {
  if (IS_TAURI) {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load(STORE_FILE, { defaults: {}, autoSave: false })
    await store.set('registry', data)
    await store.save()
    return
  }
  localStorage.setItem(LS_KEY, JSON.stringify(data))
}

// ── store ────────────────────────────────────────────────────────────────────

interface RegistryState {
  loaded: boolean
  /** set when the list could not be read or saved; shown to the user */
  error: string | null
  keyboards: KeyboardDef[]
  selectedId: string | null
  load: () => Promise<void>
  select: (id: string | null) => void
  add: (def: Omit<KeyboardDef, 'id' | 'createdAt'>) => KeyboardDef
  update: (id: string, patch: Partial<Omit<KeyboardDef, 'id'>>) => void
  remove: (id: string) => void
  selected: () => KeyboardDef | null
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
/** true after a failed read: never write over a file we could not read */
let readFailed = false
function schedulePersist(get: () => RegistryState) {
  if (readFailed) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    const { keyboards, selectedId } = get()
    writePersisted({ version: 1, keyboards, selectedId })
      .then(() => { if (useRegistryStore.getState().error) useRegistryStore.setState({ error: null }) })
      .catch(err => useRegistryStore.setState({ error: `Your keyboard list could not be saved, so this change will be lost when you quit: ${err}` }))
  }, 50)
}

export const useRegistryStore = create<RegistryState>((set, get) => ({
  loaded: false,
  error: null,
  keyboards: [],
  selectedId: null,

  load: async () => {
    if (get().loaded) return
    let data: RegistryData
    try {
      data = (await readPersisted()) ?? EMPTY_REGISTRY
    } catch (e) {
      // leave the file alone; editing is still possible but nothing is written over it until a change is made
      readFailed = true
      set({ loaded: true, error: `${e instanceof Error ? e.message : e}. Changes are not saved until the app can read it; restart the app to retry.` })
      return
    }
    // Built-in layouts are copied into the registry when a keyboard is added;
    // refresh them so geometry fixes (e.g. the Procyon's mirrored halves) reach saved keyboards.
    const BUILT_IN: Record<string, PhysicalLayout> = { [LEGACY_CROSSES.origin!]: LEGACY_CROSSES, [LEGACY_CORNE_PROCYON.origin!]: LEGACY_CORNE_PROCYON }
    data = { ...data, keyboards: data.keyboards.map(k => {
      const fresh = k.layout?.source === 'legacy' && k.layout.origin ? BUILT_IN[k.layout.origin] : undefined
      return fresh && fresh.keys.length === k.layout.keys.length ? { ...k, layout: fresh } : k
    }) }
    // Drop stale selection.
    const selectedId = data.keyboards.some(k => k.id === data!.selectedId) ? data.selectedId : (data.keyboards[0]?.id ?? null)
    set({ loaded: true, keyboards: data.keyboards, selectedId })
  },

  select: (id) => { set({ selectedId: id }); schedulePersist(get) },

  add: (def) => {
    const kb: KeyboardDef = { ...def, id: newKeyboardId(def.name), createdAt: new Date().toISOString() }
    set(s => ({ keyboards: [...s.keyboards, kb], selectedId: s.selectedId ?? kb.id }))
    schedulePersist(get)
    return kb
  },

  update: (id, patch) => {
    set(s => ({ keyboards: s.keyboards.map(k => (k.id === id ? { ...k, ...patch, id } : k)) }))
    schedulePersist(get)
  },

  remove: (id) => {
    set(s => {
      const keyboards = s.keyboards.filter(k => k.id !== id)
      return { keyboards, selectedId: s.selectedId === id ? (keyboards[0]?.id ?? null) : s.selectedId }
    })
    schedulePersist(get)
  },

  selected: () => {
    const { keyboards, selectedId } = get()
    return keyboards.find(k => k.id === selectedId) ?? null
  },
}))
