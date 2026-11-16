/**
 * ZMK deep-sleep setting (CONFIG_ZMK_SLEEP + CONFIG_ZMK_IDLE_SLEEP_TIMEOUT).
 *
 * Pure text logic, no I/O. A keyboard is one or more "parts" (a single board,
 * or each half / dongle of a split); each part's build merges an ordered chain
 * of .conf files, later files winning. Reading takes the last assignment along
 * the chain; writing edits the file that currently defines the key (so a later
 * file can't silently override the change) or appends to the part's first
 * existing file. Only files ZMK actually merges belong in a chain: a .conf that
 * the build never reads (e.g. a shared `<shield>.conf` inside the shield folder)
 * would make a setting look applied while it does nothing.
 */

import { keepEol, toLf } from './lineEndings'

export const SLEEP_KEY = 'CONFIG_ZMK_SLEEP'
export const TIMEOUT_KEY = 'CONFIG_ZMK_IDLE_SLEEP_TIMEOUT'
/** ZMK's default for CONFIG_ZMK_IDLE_SLEEP_TIMEOUT (app/Kconfig). */
export const DEFAULT_TIMEOUT_MS = 900_000

export interface ConfFile {
  path: string
  /** null when the file does not exist yet */
  text: string | null
}

export interface Part {
  /** build.yaml shield name, e.g. `corne_left` */
  name: string
  /** files the build merges for this part, in merge order (later wins) */
  chain: ConfFile[]
}

export type Sleep = { kind: 'never' } | { kind: 'after'; ms: number }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const assignRe = (key: string) => new RegExp(`^[ \\t]*${esc(key)}[ \\t]*=[ \\t]*(\\S*)[ \\t]*(#.*)?$`, 'gm')
const notSetRe = (key: string) => new RegExp(`^[ \\t]*#[ \\t]*${esc(key)} is not set[ \\t]*$`, 'gm')

/** Last value assigned to `key` in a Kconfig fragment (`# KEY is not set` reads as `n`), or null. */
export function readKey(input: string, key: string): string | null {
  const text = toLf(input)
  let best: { at: number; value: string } | null = null
  for (const m of text.matchAll(assignRe(key))) if (!best || m.index! >= best.at) best = { at: m.index!, value: m[1] }
  for (const m of text.matchAll(notSetRe(key))) if (!best || m.index! >= best.at) best = { at: m.index!, value: 'n' }
  return best?.value ?? null
}

/** Value and defining file of `key` along a chain. */
export function effective(chain: ConfFile[], key: string): { value: string | null; path: string | null } {
  let out: { value: string | null; path: string | null } = { value: null, path: null }
  for (const f of chain) {
    if (f.text == null) continue
    const v = readKey(f.text, key)
    if (v != null) out = { value: v, path: f.path }
  }
  return out
}

export function partSleep(part: Part): Sleep {
  if (effective(part.chain, SLEEP_KEY).value !== 'y') return { kind: 'never' }
  const raw = effective(part.chain, TIMEOUT_KEY).value
  const ms = raw != null && /^\d+$/.test(raw) ? Number(raw) : DEFAULT_TIMEOUT_MS
  return { kind: 'after', ms }
}

export function sameSleep(a: Sleep, b: Sleep): boolean {
  return a.kind === b.kind && (a.kind === 'never' || a.ms === (b as { ms: number }).ms)
}

/** Replace every assignment of `key` (and `# key is not set`) with `key=value`, or append one. */
export function setKey(text: string, key: string, value: string, comment?: string): string {
  return keepEol(text, lf => setKeyLf(lf, key, value, comment))
}

function setKeyLf(text: string, key: string, value: string, comment?: string): string {
  const line = `${key}=${value}`
  let hit = false
  const out = text
    .replace(assignRe(key), () => { hit = true; return line })
    .replace(notSetRe(key), () => { hit = true; return line })
  if (hit) return out
  const body = out.replace(/\s*$/, '')
  const block = (comment ? `# ${comment}\n` : '') + line + '\n'
  // keep the sleep keys together; anything else gets a blank line before it
  const sep = /(^|\n)CONFIG_ZMK_\w*SLEEP\w*=[^\n]*$/.test(body) ? '\n' : '\n\n'
  return body ? `${body}${sep}${block}` : block
}

export interface FileEdit { path: string; before: string; after: string; created: boolean }

/** Edits that make every part sleep as `want`. Unchanged files are left out. */
export function planSleep(parts: Part[], want: Sleep): FileEdit[] {
  const texts = new Map<string, string | null>()
  for (const p of parts) for (const f of p.chain) if (!texts.has(f.path)) texts.set(f.path, f.text)
  const live = (p: Part): Part => ({ ...p, chain: p.chain.map(f => ({ path: f.path, text: texts.get(f.path) ?? null })) })

  const put = (p: Part, key: string, value: string, comment?: string) => {
    const cur = live(p)
    const def = effective(cur.chain, key)
    if (def.value === value || (value === 'n' && def.value == null)) return
    const target = def.path ?? cur.chain.find(f => f.text != null)?.path ?? cur.chain[0].path
    texts.set(target, setKey(texts.get(target) ?? '', key, value, comment))
  }

  for (const p of parts) {
    if (p.chain.length === 0) continue
    if (want.kind === 'never') {
      put(p, SLEEP_KEY, 'n')
    } else {
      put(p, SLEEP_KEY, 'y', 'Deep sleep: Bluetooth off after this much idle time (set in Ultimate Keyboards)')
      put(p, TIMEOUT_KEY, String(want.ms))
    }
  }

  const before = new Map<string, string | null>()
  for (const p of parts) for (const f of p.chain) if (!before.has(f.path)) before.set(f.path, f.text)
  const edits: FileEdit[] = []
  for (const [path, after] of texts) {
    const b = before.get(path) ?? null
    if (after != null && after !== (b ?? '')) edits.push({ path, before: b ?? '', after, created: b == null })
  }
  return edits
}

/** "15 min", "1 hour", "90 min" … */
export function sleepLabel(s: Sleep): string {
  if (s.kind === 'never') return 'Never'
  const min = s.ms / 60_000
  if (min >= 60 && Number.isInteger(min / 60)) return `${min / 60} hour${min === 60 ? '' : 's'}`
  if (Number.isInteger(min)) return `${min} min`
  return `${Math.round(s.ms / 1000)} s`
}

/** Readable part name: `corne_tp_left` → "Left half", `glove80_rh` → "Right half". */
export function partLabel(name: string, all: string[]): string {
  const m = /_(left|right|lh|rh|dongle|central|peripheral)$/.exec(name)
  if (!m || all.length < 2) return name
  const side = m[1] === 'lh' ? 'left' : m[1] === 'rh' ? 'right' : m[1]
  return side === 'left' || side === 'right' ? `${side[0].toUpperCase()}${side.slice(1)} half` : `${side[0].toUpperCase()}${side.slice(1)}`
}
