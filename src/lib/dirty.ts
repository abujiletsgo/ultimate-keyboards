/**
 * App-wide unsaved-changes registry.
 *
 * Every section that can hold unsaved edits registers a getter. The combined
 * state is mirrored to the Rust side (`set_dirty`) so Cmd-Q / tray Quit can
 * prompt before discarding work, and to `beforeunload` for the web build.
 */
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './io'

type DirtyGetter = () => boolean

const sources = new Map<string, DirtyGetter>()
let lastReported: boolean | null = null

export function isAnyDirty(): boolean {
  for (const get of sources.values()) {
    if (get()) return true
  }
  return false
}

/** Push the current combined state to the native side (no-op if unchanged). */
export function syncDirty(): void {
  const dirty = isAnyDirty()
  if (dirty === lastReported) return
  lastReported = dirty
  if (IS_TAURI) {
    invoke('set_dirty', { dirty }).catch(() => {})
  }
}

/**
 * Register a dirty source. Returns an unregister function. Call `syncDirty()`
 * whenever the source's state may have changed (stores do this from
 * `subscribe`; components from an effect).
 */
export function registerDirtySource(id: string, get: DirtyGetter): () => void {
  sources.set(id, get)
  syncDirty()
  return () => {
    sources.delete(id)
    syncDirty()
  }
}
