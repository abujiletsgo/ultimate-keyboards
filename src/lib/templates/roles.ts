import type { Rule } from '../karabinerGenerator'
import { MACBOOK_LAYOUT } from '../macbookLayout'
import type { KeyTemplate } from './index'

/** What a key on the preview is doing. Names are the same words as the page legend. */
export type KeyRole = 'modtap' | 'layer' | 'binding' | 'combo'

export const ROLE_WORDS: Record<KeyRole, string> = {
  modtap: 'Hold for a shortcut key',
  layer: 'Hold for new keys',
  binding: 'Changes while held',
  combo: 'Press together',
}
/** Legend order for the page; "binding" is only said in a sheet that has it. */
export const PAGE_LEGEND: { role: KeyRole; word: string }[] = [
  { role: 'modtap', word: ROLE_WORDS.modtap },
  { role: 'layer', word: 'Hold for new keys' },
  { role: 'combo', word: ROLE_WORDS.combo },
]

export interface KeyMark { role: KeyRole; mark: string }

const MOD_GLYPH: Record<string, string> = { command: '⌘', option: '⌥', control: '⌃', shift: '⇧' }
const SHIFTED_DIGIT = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')']
const OUTPUT: Record<string, string> = {
  left_arrow: '←', right_arrow: '→', up_arrow: '↑', down_arrow: '↓', spacebar: 'space', escape: 'esc', tab: 'tab',
  return_or_enter: 'return', delete_or_backspace: 'delete', delete_forward: 'del',
  hyphen: '-', equal_sign: '=', open_bracket: '[', close_bracket: ']', backslash: '\\', semicolon: ';', quote: "'",
  comma: ',', period: '.', slash: '/', grave_accent_and_tilde: '`',
}

export const modGlyph = (modKey: string): string => MOD_GLYPH[modKey.replace(/^(left|right)_/, '')] ?? '⌘'
const keyLabel = (code: string): string => MACBOOK_LAYOUT.find(k => k.code === code)?.label.toUpperCase() ?? code

/** The mark a layer binding shows: its new output. */
export function bindingMark(toKey: string, toModifiers?: string[]): string {
  if (toModifiers?.length === 1 && toModifiers[0] === 'shift' && /^[0-9]$/.test(toKey)) return SHIFTED_DIGIT[(Number(toKey) + 9) % 10]
  return OUTPUT[toKey] ?? (toKey.length === 1 ? toKey.toUpperCase() : keyLabel(toKey))
}

/**
 * Key code -> role and mark for the keys the rules change. `layers` limits which layers' bindings are
 * drawn (one picture shows one layer at a time); omit it to draw every binding.
 */
export function rolesFromRules(rules: readonly Rule[], layers?: ReadonlySet<string>): Map<string, KeyMark> {
  const out = new Map<string, KeyMark>()
  for (const rule of rules) {
    if (rule.type === 'homerow_mod') out.set(rule.fromKey, { role: 'modtap', mark: modGlyph(rule.modKey) })
    else if (rule.type === 'layer_activator') out.set(rule.fromKey, { role: 'layer', mark: 'hold' })
    else if (rule.type === 'combo') for (const key of rule.fromKeys) if (!out.has(key)) out.set(key, { role: 'combo', mark: keyLabel(key) })
  }
  for (const rule of rules) {
    if (rule.type === 'layer_binding' && (!layers || layers.has(rule.layerName)) && !out.has(rule.fromKey)) {
      out.set(rule.fromKey, { role: 'binding', mark: bindingMark(rule.toKey, rule.toModifiers) })
    }
  }
  return out
}

export const templateRoles = (template: KeyTemplate): Map<string, KeyMark> => rolesFromRules(template.rules)

/** The picture of the working profile for the same layers the template draws. */
export function currentRoles(rules: readonly Rule[], template: KeyTemplate): Map<string, KeyMark> {
  const layers = new Set(template.rules.flatMap(r => (r.type === 'layer_binding' ? [r.layerName] : [])))
  return rolesFromRules(rules, layers)
}

/** Roles a template uses, in legend order. */
export function rolesUsed(template: KeyTemplate): KeyRole[] {
  const used = new Set([...templateRoles(template).values()].map(m => m.role))
  return (['modtap', 'layer', 'binding', 'combo'] as KeyRole[]).filter(r => used.has(r))
}

/** Words a screen reader hears for the picture; built from `changes`, so it is said once and stays true. */
export function previewLabel(template: KeyTemplate): string {
  return `Preview: ${template.changes.join('. ')}. Other keys stay the same.`
}
