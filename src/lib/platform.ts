/**
 * Which computer the app is running on, and the words, key names and drawings
 * that depend on it. macOS is the default for anything that is not Windows, so
 * the Mac screens stay exactly as they were.
 *
 * Design review: add `?os=windows` to the page address in a browser to see the
 * Windows screens; the installed desktop app always uses the real system.
 */

export type HostOS = 'mac' | 'windows'

export function detectHostOS(userAgent: string, search = ''): HostOS {
  const forced = /[?&]os=(mac|windows)\b/.exec(search)?.[1]
  if (forced) return forced as HostOS
  return /Windows/i.test(userAgent) ? 'windows' : 'mac'
}

function initial(): HostOS {
  if (typeof navigator === 'undefined') return 'mac'
  const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  return detectHostOS(navigator.userAgent, isDesktop || typeof location === 'undefined' ? '' : location.search)
}

let current: HostOS = initial()

export const hostOS = (): HostOS => current
export const isWindows = (): boolean => current === 'windows'
/** Tests only. */
export function setHostOS(os: HostOS): void { current = os }

export interface HostTerms {
  /** Sidebar group: the computer itself. */
  thisHost: string
  /** Sidebar item and tab title for the built-in keyboard. */
  laptopKeys: string
  /** Short name of the laptop in a sentence or a title. */
  laptop: string
  /** "the MacBook keyboard" / "the laptop keyboard". */
  laptopKeyboard: string
  /** The app-level shortcut key, as the platform writes it. */
  shortcutKey: string
}

export function termsFor(os: HostOS): HostTerms {
  return os === 'windows'
    ? { thisHost: 'This PC', laptopKeys: 'Laptop keys', laptop: 'Laptop', laptopKeyboard: 'laptop keyboard', shortcutKey: 'Ctrl+' }
    : { thisHost: 'This Mac', laptopKeys: 'MacBook Keys', laptop: 'MacBook', laptopKeyboard: 'MacBook keyboard', shortcutKey: '⌘' }
}
export const hostTerms = (): HostTerms => termsFor(current)

// ── Modifier names ───────────────────────────────────────────────────────────
// The rules keep the Mac vocabulary (command / option / control) as their file
// format; on Windows command is the Win key and option is Alt.

const GLYPH: Record<string, string> = { command: '⌘', option: '⌥', control: '⌃', shift: '⇧', fn: 'fn' }
const WORD: Record<string, string> = { command: 'Win', option: 'Alt', control: 'Ctrl', shift: 'Shift', fn: 'Fn' }

const family = (mod: string) => mod.replace(/^(left|right)_/, '')

/** One modifier as shown on a key or in a sentence: ⌘ on a Mac, Win on Windows. */
export function modifierName(mod: string, os: HostOS = current): string {
  const f = family(mod)
  return (os === 'windows' ? WORD : GLYPH)[f] ?? mod
}

/** A held-modifier set as a prefix for a key: `⌃⇧` + `4` on a Mac, `Ctrl+Shift+` + `4` on Windows. */
export function modifierPrefix(mods: readonly string[] | undefined, os: HostOS = current): string {
  const names = (mods ?? []).map(m => modifierName(m, os))
  return os === 'windows' ? names.map(n => `${n}+`).join('') : names.join('')
}

/** A held-modifier set on its own: `⌃⇧` or `Ctrl+Shift`. */
export function modifierText(mods: readonly string[] | undefined, os: HostOS = current): string {
  const names = (mods ?? []).map(m => modifierName(m, os))
  return names.join(os === 'windows' ? '+' : '')
}

/** The long name used in pickers: Command / Option / Control on a Mac, Win / Alt / Ctrl on Windows. */
export function modifierLong(mod: string, os: HostOS = current): string {
  const f = family(mod)
  if (os === 'windows') return WORD[f] ?? mod
  return ({ command: 'Command', option: 'Option', control: 'Control', shift: 'Shift', fn: 'Fn' } as Record<string, string>)[f] ?? mod
}

/** A modifier key as a screen reader or tooltip says it: `left command` / `left Win`. */
export function modifierSpoken(mod: string, os: HostOS = current): string {
  const words = mod.replace(/_/g, ' ')
  return os === 'windows' ? words.replace('command', 'Win').replace('option', 'Alt').replace('control', 'Ctrl') : words
}

/** Hyper: all four modifiers at once. */
export const hyperName = (os: HostOS = current): string => (os === 'windows' ? 'Hyper' : '⌃⌥⇧⌘')

const GLYPH_NAME: Record<string, string> = { '⌘': 'Win', '⌥': 'Alt', '⌃': 'Ctrl', '⇧': 'Shift' }

/**
 * Rewrite Mac modifier symbols inside a sentence for Windows: `⌃⌥⇧⌘` → `Ctrl+Alt+Shift+Win`,
 * `⌃←` → `Ctrl+←`, `A=⌃` → `A=Ctrl`. Unchanged on a Mac.
 */
export function localizeKeys(text: string, os: HostOS = current): string {
  if (os !== 'windows') return text
  return text.replace(/([⌘⌥⌃⇧]+)(?=(.?))/gu, (_m, run: string, next: string) => {
    const words = [...run].map(g => GLYPH_NAME[g]).join('+')
    return /[\p{L}\p{N}←→↑↓`]/u.test(next) ? `${words}+` : words
  })
}
