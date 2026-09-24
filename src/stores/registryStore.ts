/**
 * Keyboard registry store. Desktop persists through tauri-plugin-store
 * (app-data dir, survives reinstalls); the web build uses localStorage.
 *
 * First run on an install that predates the registry seeds the two
 * keyboards the app used to hardcode — only if their files still exist —
 * so nothing is compiled in for anyone else.
 */
import { create } from 'zustand'
import { exists } from '@tauri-apps/plugin-fs'
import { homeDir, join } from '@tauri-apps/api/path'
import { IS_TAURI } from '@/lib/io'
import { LEGACY_CROSSES, LEGACY_CORNE_PROCYON } from '@/lib/layout'
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
  } catch {
    return null
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

// ── legacy seed (pre-registry installs) ─────────────────────────────────────

async function legacySeed(): Promise<KeyboardDef[]> {
  if (!IS_TAURI) return []
  const home = await homeDir()
  const now = new Date().toISOString()
  const out: KeyboardDef[] = []
  const tryAdd = async (def: Omit<KeyboardDef, 'id' | 'createdAt'>) => {
    if (await exists(def.keymapPath).catch(() => false)) {
      out.push({ ...def, id: newKeyboardId(def.name), createdAt: now })
    }
  }
  const corneRepo = await join(home, 'Documents', 'cross_keyboard')
  await tryAdd({
    name: 'Corne', firmware: 'zmk', shield: 'corne_tp', repoPath: corneRepo,
    keymapPath: await join(corneRepo, 'config', 'corne_tp.keymap'),
    layout: LEGACY_CROSSES,
    pointing: [{
      id: 'trackpad', name: 'Trackpad', chip: 'Azoteq IQS5XX', compatible: 'azoteq,iqs5xx',
      overlayPath: await join(corneRepo, 'config', 'boards', 'shields', 'corne_tp', 'corne_tp_right.overlay'),
      sensorNodeRe: 'trackpad\\s*:\\s*iqs5xx@74\\s*\\{', listenerNodeRe: 'trackpad_listener\\s*\\{',
      supports: { cursorScaler: true, chipSensitivity: false, cpi: false, invertXY: false, smartMode: false, scrollToggles: true, gestures: true, advancedAzoteq: true, snipe: true, scrollLayer: false },
    }],
  })
  const crossesRepo = await join(home, 'Documents', 'cross_keyboard-crosses')
  await tryAdd({
    name: 'Crosses', firmware: 'zmk', shield: 'crosses', repoPath: crossesRepo,
    keymapPath: await join(crossesRepo, 'config', 'crosses.keymap'),
    layout: LEGACY_CROSSES,
    pointing: [{
      id: 'trackball', name: 'Trackball', chip: 'Pixart PMW3610', compatible: 'pixart,pmw3610',
      overlayPath: await join(crossesRepo, 'config', 'boards', 'shields', 'crosses', 'crosses_right.overlay'),
      sensorNodeRe: 'trackball\\s*:\\s*trackball@0\\s*\\{', listenerNodeRe: 'trackball_listener\\s*\\{',
      supports: { cursorScaler: true, chipSensitivity: false, cpi: true, invertXY: true, smartMode: true, scrollToggles: false, gestures: false, advancedAzoteq: false, snipe: true, scrollLayer: true },
    }],
  })
  const procyonDir = await join(home, 'Documents', 'splitkey2', 'corne_procyon')
  await tryAdd({
    name: 'Corne Procyon', firmware: 'qmk', shield: 'corne_procyon36', repoPath: procyonDir,
    keymapPath: await join(procyonDir, 'corne_procyon.layout.json'),
    keymapCPath: await join(procyonDir, 'corne_procyon36', 'keymaps', 'default', 'keymap.c'),
    layout: LEGACY_CORNE_PROCYON,
    pointing: [],
  })
  return out
}

// ── store ────────────────────────────────────────────────────────────────────

interface RegistryState {
  loaded: boolean
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
function schedulePersist(get: () => RegistryState) {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    const { keyboards, selectedId } = get()
    writePersisted({ version: 1, keyboards, selectedId }).catch(err => console.error('registry persist failed', err))
  }, 50)
}

export const useRegistryStore = create<RegistryState>((set, get) => ({
  loaded: false,
  keyboards: [],
  selectedId: null,

  load: async () => {
    if (get().loaded) return
    let data = await readPersisted()
    if (!data) {
      const seeded = await legacySeed()
      data = { ...EMPTY_REGISTRY, keyboards: seeded, selectedId: seeded[0]?.id ?? null }
      if (seeded.length) await writePersisted(data).catch(() => {})
    }
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
