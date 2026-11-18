/**
 * Holds the entered Pro key. Only the key text is saved; it is checked again
 * on every launch, so a hand-edited "pro: true" can never exist.
 * Desktop saves through tauri-plugin-store, the web build in localStorage.
 */
import { create } from 'zustand'
import { IS_TAURI } from '@/lib/io'
import { checkLicense, type LicenseCheck, type LicensePayload } from './license'

const STORE_FILE = 'license.json'
const LS_KEY = 'uk.licenseKey'

async function readKey(): Promise<string | null> {
  if (IS_TAURI) {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load(STORE_FILE, { defaults: {}, autoSave: false })
    return (await store.get<string>('key')) ?? null
  }
  return localStorage.getItem(LS_KEY)
}

async function writeKey(key: string | null): Promise<void> {
  if (IS_TAURI) {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load(STORE_FILE, { defaults: {}, autoSave: false })
    if (key === null) await store.delete('key')
    else await store.set('key', key)
    await store.save()
    return
  }
  if (key === null) localStorage.removeItem(LS_KEY)
  else localStorage.setItem(LS_KEY, key)
}

interface LicenseState {
  loaded: boolean
  /** set only from a key that passed checkLicense */
  license: LicensePayload | null
  /** why a saved key stopped working (for example it ran out) */
  savedProblem: string | null
  load: () => Promise<void>
  enter: (key: string) => Promise<LicenseCheck>
  remove: () => Promise<void>
}

export const useLicenseStore = create<LicenseState>((set) => ({
  loaded: false,
  license: null,
  savedProblem: null,
  load: async () => {
    let key: string | null = null
    try { key = await readKey() } catch { /* unreadable store reads as no key; free features are unaffected */ }
    const r = key ? await checkLicense(key) : null
    set({ loaded: true, license: r?.ok ? r.license : null, savedProblem: r && !r.ok ? r.message : null })
  },
  enter: async (key) => {
    const r = await checkLicense(key)
    if (r.ok) {
      await writeKey(key.replace(/\s+/g, ''))
      set({ license: r.license, savedProblem: null })
    }
    return r
  },
  remove: async () => {
    await writeKey(null)
    set({ license: null, savedProblem: null })
  },
}))
