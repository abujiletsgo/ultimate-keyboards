/**
 * App-wide unsaved-changes registry.
 *
 * Every section that can hold unsaved edits registers a getter (and, when it
 * can, a save function). The combined state is mirrored to the Rust side
 * (`set_dirty`) so Cmd-Q / tray Quit can prompt before discarding work, to
 * `beforeunload` for the web build, and to the sidebar navigation guard.
 */
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './io'

type DirtyGetter = () => boolean
type Saver = () => Promise<void>

interface Source { get: DirtyGetter; save?: Saver; discard?: () => void }

const sources = new Map<string, Source>()
const listeners = new Set<() => void>()
let lastReported: boolean | null = null

export function isAnyDirty(): boolean {
  for (const s of sources.values()) {
    if (s.get()) return true
  }
  return false
}

/** Names of the sources currently dirty (for the guard's message). */
export function dirtySources(): string[] {
  return [...sources.entries()].filter(([, s]) => s.get()).map(([id]) => id)
}

/** Push the current combined state to the native side and UI listeners. */
export function syncDirty(): void {
  const dirty = isAnyDirty()
  for (const l of listeners) l()
  if (dirty === lastReported) return
  lastReported = dirty
  if (IS_TAURI) {
    invoke('set_dirty', { dirty }).catch(() => {})
  }
}

export function onDirtyChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Register a dirty source. Returns an unregister function. Call `syncDirty()`
 * whenever the source's state may have changed (stores do this from
 * `subscribe`; components from an effect).
 */
export function registerDirtySource(id: string, get: DirtyGetter, save?: Saver, discard?: () => void): () => void {
  sources.set(id, { get, save, discard })
  syncDirty()
  return () => {
    sources.delete(id)
    syncDirty()
  }
}

/** Save every dirty source that knows how to save. Throws on the first failure. */
export async function saveAllDirty(): Promise<void> {
  for (const s of sources.values()) {
    if (s.get() && s.save) await s.save()
  }
  syncDirty()
}

/** Drop unsaved edits in every source that knows how to. */
export function discardAllDirty(): void {
  for (const s of sources.values()) {
    if (s.get() && s.discard) s.discard()
  }
  syncDirty()
}
