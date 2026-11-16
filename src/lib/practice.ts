/**
 * Try-it practice: one short line to type that uses a new combo or home-row key.
 * The real remapper does the work; this only reads the keys the page receives and says how it went.
 */
import type { ComboRule, HomerowModRule, Rule } from './karabinerGenerator'

/** One thing to press: a plain letter, or the special move being practised. */
export type Step =
  | { kind: 'letter'; char: string }
  | { kind: 'combo'; keys: string[]; outKey: string; outMods: Mod[]; outLabel: string }
  | { kind: 'hold'; key: string; mod: Mod; partner: string }

export type Mod = 'meta' | 'ctrl' | 'alt' | 'shift'

export interface Drill { id: string; steps: Step[] }

/** The parts of a KeyboardEvent the judge reads. */
export interface KeyLike { key: string; code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; repeat?: boolean }

export type Verdict = 'ok' | 'wrong' | 'split' | 'short' | 'ignore'

const MOD_OF: Record<string, Mod> = { command: 'meta', control: 'ctrl', option: 'alt', shift: 'shift' }
export const MOD_SYM: Record<Mod, string> = { meta: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' }
export const MOD_NAME: Record<Mod, string> = { meta: 'Command', ctrl: 'Control', alt: 'Option', shift: 'Shift' }
const modOf = (modKey: string): Mod | null => MOD_OF[modKey.replace(/^(left|right)_/, '')] ?? null

/** Engine key code → the DOM `key` it produces, for outputs a drill can check. */
const OUT_KEY: Record<string, [string, string]> = {
  return_or_enter: ['Enter', 'Enter'], delete_or_backspace: ['Backspace', 'Backspace'], escape: ['Escape', 'Esc'],
  tab: ['Tab', 'Tab'], spacebar: [' ', 'Space'], up_arrow: ['ArrowUp', '↑'], down_arrow: ['ArrowDown', '↓'],
  left_arrow: ['ArrowLeft', '←'], right_arrow: ['ArrowRight', '→'], delete_forward: ['Delete', 'Del'],
  home: ['Home', 'Home'], end: ['End', 'End'], page_up: ['PageUp', 'PgUp'], page_down: ['PageDown', 'PgDn'],
}
const keyLabel = (code: string) => code === 'semicolon' ? ';' : code.length === 1 ? code.toUpperCase() : code
const domCode = (code: string) => code === 'semicolon' ? 'Semicolon' : /^[a-z]$/.test(code) ? `Key${code.toUpperCase()}` : /^[0-9]$/.test(code) ? `Digit${code}` : ''

/** Short words to type around the move; the first one that avoids the trigger keys is used. */
const COMBO_WORDS = ['hi', 'ok', 'yes', 'go', 'cat']
/** A word with the held key in it, so the drill also proves a normal tap still types the letter. */
const HOLD_WORDS: Record<string, string> = { a: 'sad', s: 'sad', d: 'dad', f: 'fad', j: 'jam', k: 'kid', l: 'lid', semicolon: 'ok;' }
/** Partner key on the other hand, chosen to avoid app shortcuts that act on their own (⌘R, ⌘W, ⌘Q, ⌘O). */
const PARTNER = { left: 'u', right: 'e' }
const LEFT = new Set(['a', 's', 'd', 'f', 'caps_lock'])

export function drillId(rule: Rule): string {
  if (rule.type === 'combo') return `combo:${[...rule.fromKeys].sort().join('+')}>${(rule.toModifiers ?? []).join('+')}${rule.toKey}`
  if (rule.type === 'homerow_mod') return `hold:${rule.fromKey}>${rule.modKey}`
  return ''
}

/** The practice line for a rule, or null when the page can't check its result (an output it can't see). */
export function drillFor(rule: Rule): Drill | null {
  if (rule.type === 'combo') return comboDrill(rule)
  if (rule.type === 'homerow_mod') return holdDrill(rule)
  return null
}

function comboDrill(rule: ComboRule): Drill | null {
  const out = OUT_KEY[rule.toKey] ?? (/^[a-z0-9]$/.test(rule.toKey) ? [rule.toKey, rule.toKey.toUpperCase()] as [string, string] : null)
  const mods = (rule.toModifiers ?? []).map(modOf)
  if (!out || mods.includes(null) || !rule.fromKeys.every(k => domCode(k))) return null
  const word = COMBO_WORDS.find(w => ![...w].some(c => rule.fromKeys.includes(c))) ?? 'hi'
  const outMods = mods as Mod[]
  const outLabel = `${outMods.map(m => MOD_SYM[m]).join('')}${out[1]}`
  return { id: drillId(rule), steps: [...[...word].map(char => ({ kind: 'letter' as const, char })), { kind: 'combo', keys: rule.fromKeys, outKey: out[0], outMods, outLabel }] }
}

function holdDrill(rule: HomerowModRule): Drill | null {
  const mod = modOf(rule.modKey)
  if (!mod || !domCode(rule.fromKey)) return null
  const word = HOLD_WORDS[rule.fromKey] ?? rule.fromKey
  const partner = LEFT.has(rule.fromKey) ? PARTNER.left : PARTNER.right
  return { id: drillId(rule), steps: [...[...word].map(char => ({ kind: 'letter' as const, char })), { kind: 'hold', key: rule.fromKey, mod, partner }] }
}

const MOD_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Fn'])
const held = (e: KeyLike): Mod[] => ([['meta', e.metaKey], ['ctrl', e.ctrlKey], ['alt', e.altKey], ['shift', e.shiftKey]] as [Mod, boolean][]).filter(([, on]) => on).map(([m]) => m)
const sameMods = (a: Mod[], b: Mod[]) => a.length === b.length && a.every(m => b.includes(m))

/**
 * Judge one keydown against the step it should complete.
 * `ignore`: a lone modifier or key repeat (part of a hold in progress). `split`: the combo's own letters came out
 * one by one, so the keys were pressed too far apart. `short`: the held key typed its letter, so it was let go too soon.
 */
export function judge(step: Step, e: KeyLike): Verdict {
  if (e.repeat || MOD_KEYS.has(e.key)) return 'ignore'
  const mods = held(e)
  switch (step.kind) {
    case 'letter':
      return mods.filter(m => m !== 'shift').length === 0 && e.key.toLowerCase() === step.char ? 'ok' : 'wrong'
    case 'combo':
      if (e.key === step.outKey && sameMods(mods, step.outMods)) return 'ok'
      return mods.length === 0 && step.keys.some(k => e.code === domCode(k)) ? 'split' : 'wrong'
    case 'hold':
      if (e.code === domCode(step.partner) && mods.includes(step.mod)) return 'ok'
      return e.code === domCode(step.key) ? 'short' : 'wrong'
  }
}

export const stepKeyLabel = keyLabel

// ── "Already tried" memory: a per-viewer convenience, so the card offers itself once per new move. ──
const TRIED_KEY = 'uk.practice.tried'
const store = (): Storage | null => { try { return globalThis.localStorage ?? null } catch { return null } }
export function triedIds(): Set<string> {
  try { return new Set(JSON.parse(store()?.getItem(TRIED_KEY) ?? '[]') as string[]) } catch { return new Set() }
}
export function markTried(id: string): void {
  try { const ids = triedIds(); ids.add(id); store()?.setItem(TRIED_KEY, JSON.stringify([...ids])) } catch { /* private window: offer again next time */ }
}
