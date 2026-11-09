/**
 * Last-known data for views that load on mount (Build status, sleep setting,
 * keymap.c combos). A view reopened later draws this in its first frame and
 * refreshes in the background, instead of showing a skeleton over data the
 * app already read. Process memory only; a relaunch starts empty.
 */
const store = new Map<string, unknown>()

export const viewCache = {
  get<T>(key: string): T | undefined {
    return store.get(key) as T | undefined
  },
  set<T>(key: string, value: T): T {
    store.set(key, value)
    return value
  },
  delete(key: string): void {
    store.delete(key)
  },
  clear(): void {
    store.clear()
  },
}
