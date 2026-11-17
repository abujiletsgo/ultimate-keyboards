/**
 * Move a laptop-keys profile between a Mac and a Windows PC as one file.
 *
 * Rules keep the Mac vocabulary on both systems (`command` is the Win key on Windows), so a
 * file can be read anywhere. What changes between systems is meaning: copy, paste and undo use
 * Command on a Mac and Ctrl on Windows. When the file comes from the other system, import can
 * swap Command and Control in everything the profile *sends* (held modifiers, output keys,
 * shortcut triggers) so Cmd+C on the Mac stays copy on Windows. The physical key a rule starts
 * from (`fromKey`, `fromKeys`) never changes: it is a place on the keyboard, not a meaning.
 */
import type { Rule } from './karabinerGenerator'
import type { HostOS } from './platform'
import { macLayerNames, type MacProfileSnapshot } from './macLayerEditing'
import { MAX_FILE_BYTES } from './io'

export const PROFILE_FORMAT = 'ultimate-keyboards/laptop-keys'
export const PROFILE_VERSION = 1

export interface ProfileFile {
  format: typeof PROFILE_FORMAT
  version: number
  /** The system the profile was made on. */
  os: HostOS
  exportedAt: string
  profile: MacProfileSnapshot
}

export interface ParsedProfile {
  from: HostOS
  profile: MacProfileSnapshot
}

export function serializeProfile(profile: MacProfileSnapshot, os: HostOS, now = new Date()): string {
  const file: ProfileFile = {
    format: PROFILE_FORMAT, version: PROFILE_VERSION, os, exportedAt: now.toISOString(),
    profile: structuredClone({ profileTitle: profile.profileTitle, rules: profile.rules, layerNames: profile.layerNames }),
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

/** The file name the save dialog suggests: `ultimate-keyboards-mac.json`. */
export const exportFileName = (os: HostOS): string => `ultimate-keyboards-${os}.json`

const RULE_TYPES = new Set(['simple', 'combo', 'layer_activator', 'layer_binding', 'homerow_mod'])
const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)

function ruleError(rule: unknown, i: number): string | null {
  const at = `Change ${i + 1}`
  if (!rule || typeof rule !== 'object') return `${at} is not a key change.`
  const r = rule as Record<string, unknown>
  if (!isStr(r.type) || !RULE_TYPES.has(r.type)) return `${at} has an unknown kind (${String(r.type)}).`
  if (r.description !== undefined && !isStr(r.description)) return `${at} has a broken description.`
  for (const f of ['toModifiers', 'fromModifiers'] as const) if (r[f] !== undefined && !isStrList(r[f])) return `${at} has broken modifiers.`
  const need = (...fields: string[]) => fields.find(f => !isStr(r[f]))
  const missing = r.type === 'simple' ? need('fromKey', 'toKey')
    : r.type === 'combo' ? (isStrList(r.fromKeys) && r.fromKeys.length >= 2 ? need('toKey') : 'fromKeys')
    : r.type === 'layer_activator' ? need('fromKey', 'layerName')
    : r.type === 'layer_binding' ? need('layerName', 'fromKey', 'toKey')
    : need('fromKey', 'tapKey', 'modKey')
  return missing ? `${at} is missing ${missing}.` : null
}

/** Read an exported file. Throws an Error whose message can be shown as is. */
export function parseProfile(text: string): ParsedProfile {
  if (text.length > MAX_FILE_BYTES) throw new Error('This file is too big to be a keyboard profile.')
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error('This file isn’t a keyboard profile (it isn’t JSON).') }
  const file = data as Partial<ProfileFile> | null
  if (!file || typeof file !== 'object' || file.format !== PROFILE_FORMAT) throw new Error('This file isn’t an Ultimate Keyboards profile.')
  if (typeof file.version !== 'number' || file.version > PROFILE_VERSION) throw new Error('This profile was made by a newer version of the app. Update the app, then import it.')
  if (file.os !== 'mac' && file.os !== 'windows') throw new Error('This profile doesn’t say which computer it came from.')
  const p = file.profile as Partial<MacProfileSnapshot> | undefined
  if (!p || !Array.isArray(p.rules)) throw new Error('This profile has no key changes in it.')
  for (const [i, rule] of p.rules.entries()) { const error = ruleError(rule, i); if (error) throw new Error(error) }
  const rules = structuredClone(p.rules) as Rule[]
  for (const rule of rules) if (!isStr(rule.description)) rule.description = ''
  return {
    from: file.os,
    profile: {
      profileTitle: isStr(p.profileTitle) && p.profileTitle.trim() ? p.profileTitle : 'Imported profile',
      rules,
      layerNames: macLayerNames(rules, isStrList(p.layerNames) ? p.layerNames : []),
    },
  }
}

// ── Command <-> Control ─────────────────────────────────────────────────────

/** `command` <-> `control`, `left_command` <-> `left_control`, and so on. Everything else is unchanged. */
export function swapModifierName(name: string): string {
  const m = /^(left_|right_)?(command|control)$/.exec(name)
  return m ? `${m[1] ?? ''}${m[2] === 'command' ? 'control' : 'command'}` : name
}

const swapList = (mods: string[] | undefined) => mods?.map(swapModifierName)

/** Mac and Windows names in a description: ⌘ <-> ⌃, Command <-> Control, Cmd <-> Ctrl. */
export function swapDescription(text: string): string {
  const pairs: Record<string, string> = { '⌘': '⌃', '⌃': '⌘', Command: 'Control', Control: 'Command', Cmd: 'Ctrl', Ctrl: 'Cmd' }
  return text.replace(/⌘|⌃|\b(?:Command|Control|Cmd|Ctrl)\b/g, word => pairs[word])
}

/** One rule with Command and Control swapped in what it sends; the physical key it starts from stays. */
export function swapRule(rule: Rule): Rule {
  const r = structuredClone(rule)
  r.description = swapDescription(r.description)
  switch (r.type) {
    case 'simple': return { ...r, fromModifiers: swapList(r.fromModifiers), toKey: swapModifierName(r.toKey), toModifiers: swapList(r.toModifiers) }
    case 'combo': return { ...r, toKey: swapModifierName(r.toKey), toModifiers: swapList(r.toModifiers) }
    case 'layer_binding': return { ...r, toKey: swapModifierName(r.toKey), toModifiers: swapList(r.toModifiers) }
    case 'layer_activator': return r.tapKey === undefined ? r : { ...r, tapKey: swapModifierName(r.tapKey) }
    case 'homerow_mod': return { ...r, tapKey: swapModifierName(r.tapKey), modKey: swapModifierName(r.modKey) }
  }
}

/** Drop `undefined` fields the swap may add, so a swapped-twice profile equals the original. */
const clean = (rule: Rule): Rule => JSON.parse(JSON.stringify(rule)) as Rule

export function swapProfile(profile: MacProfileSnapshot): MacProfileSnapshot {
  return { ...structuredClone(profile), rules: profile.rules.map(rule => clean(swapRule(rule))) }
}

/** How many changes the swap would touch: shown before import so the choice is concrete. */
export function countSwapped(profile: MacProfileSnapshot): number {
  return profile.rules.filter(rule => JSON.stringify(clean(swapRule(rule))) !== JSON.stringify(rule)).length
}

/** The profile as it lands on `host`: swapped only when it came from the other system and `swap` is on. */
export function profileForHost(parsed: ParsedProfile, host: HostOS, swap: boolean): MacProfileSnapshot {
  return parsed.from !== host && swap ? swapProfile(parsed.profile) : structuredClone(parsed.profile)
}

export const osName = (os: HostOS): string => (os === 'windows' ? 'Windows' : 'Mac')
