/** App navigation model: a keyboard is the top-level object; host-level tools live under "This Mac". */

export type Section =
  | { kind: 'keyboard'; id: string }
  | { kind: 'karabiner' }
  | { kind: 'mouse' }
  /** `add` opens the add flow; `n` is a nonce so repeating the same request re-triggers it */
  | { kind: 'settings'; add?: 'find' | 'usb' | 'folder' | 'file'; edit?: string; n?: number }
  | { kind: 'onboarding' }

export function sectionKey(s: Section): string {
  return s.kind === 'keyboard' ? `keyboard:${s.id}` : s.kind
}

export function sameSection(a: Section, b: Section): boolean {
  return sectionKey(a) === sectionKey(b)
}

const LS_KEY = 'uk.activeSection'

export function loadSection(): Section | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    if (raw.startsWith('keyboard:')) return { kind: 'keyboard', id: raw.slice('keyboard:'.length) }
    if (raw === 'karabiner' || raw === 'mouse' || raw === 'settings') return { kind: raw }
    return null
  } catch {
    return null
  }
}

export function saveSection(s: Section): void {
  try { localStorage.setItem(LS_KEY, sectionKey(s)) } catch { /* ignore */ }
}
