/** First run: the editor opens on Templates until the Templates tab has been shown once. */
export const TEMPLATES_SEEN_KEY = 'uk.templates.seen'

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | null => { try { return globalThis.localStorage ?? null } catch { return null } }

export function templatesSeen(storage: Store | null = local()): boolean {
  try { return storage?.getItem(TEMPLATES_SEEN_KEY) === '1' } catch { return false }
}
export function markTemplatesSeen(storage: Store | null = local()): void {
  try { storage?.setItem(TEMPLATES_SEEN_KEY, '1') } catch { /* private mode: the tab just opens first again */ }
}
export function initialEditorTab<T extends string>(fallback: T, storage: Store | null = local()): 'templates' | T {
  return templatesSeen(storage) ? fallback : 'templates'
}
