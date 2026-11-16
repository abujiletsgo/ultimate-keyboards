/**
 * One key's Tap / Hold / Combos, read from and written to the profile rules.
 * Pure: every writer returns a new rule list and never touches its input.
 *
 *   Tap   what the key types (plus modifiers, only when Hold is None).
 *   Hold  nothing, a modifier (home-row rule), or a layer (layer-key rule).
 *   Combo other keys pressed together with this one.
 *
 * On a layer only Tap exists (a layer binding). Rule order does not matter: the engine
 * gives a combo first chance at a key before its hold.
 */
import type { ComboRule, Rule } from './karabinerGenerator'
import { LAPTOP_LAYOUT } from './macbookLayout'
import { macBaseRuleIndex } from './macKeymapView'
import { isWindows, modifierLong } from './platform'
import { NATIVE_KEYS, NATIVE_MODIFIERS, applyNativeBinding, readNativeBinding, selectNativeKeyChoice, type NativeBinding } from './nativeBinding'

export type Hold = { kind: 'none' } | { kind: 'modifier'; modifier: string } | { kind: 'layer'; layer: string }
export interface KeyTap { key: string; modifiers: string[]; /** a rule sets this; false = the key is itself */ custom: boolean }
export interface KeyCombo { index: number; keys: string[]; partners: string[]; toKey: string; toModifiers: string[] }
export interface KeyActions { tap: KeyTap; hold: Hold; combos: KeyCombo[] }

/** The four plain modifiers; Hyper (all four) is added only for Caps Lock. */
export const HOLD_FAMILIES = ['command', 'option', 'control', 'shift'] as const
export const modifierFamily = (modifier: string) => modifier.replace(/^(left|right)_/, '')

const asBinding = (tap: { key: string; modifiers: string[] }): NativeBinding =>
  ({ behavior: 'key', key: tap.key, modifiers: tap.modifiers, layer: '', modifier: 'left_shift', holdBehavior: 'balanced' })

export function readKeyActions(rules: readonly Rule[], code: string, layer: string | null): KeyActions {
  if (layer !== null) {
    const rule = rules.find(r => r.type === 'layer_binding' && r.layerName === layer && r.fromKey === code)
    return { hold: { kind: 'none' }, combos: [],
      tap: rule?.type === 'layer_binding' ? { key: rule.toKey, modifiers: [...(rule.toModifiers ?? [])], custom: true } : { key: code, modifiers: [], custom: false } }
  }
  const combos: KeyCombo[] = []
  rules.forEach((rule, index) => {
    if (rule.type === 'combo' && rule.fromKeys.includes(code))
      combos.push({ index, keys: [...rule.fromKeys], partners: rule.fromKeys.filter(key => key !== code), toKey: rule.toKey, toModifiers: [...(rule.toModifiers ?? [])] })
  })
  const rule = rules[macBaseRuleIndex(rules, code)]
  if (!rule) return { tap: { key: code, modifiers: [], custom: false }, hold: { kind: 'none' }, combos }
  if (rule.type === 'simple') return { tap: { key: rule.toKey, modifiers: [...(rule.toModifiers ?? [])], custom: true }, hold: { kind: 'none' }, combos }
  if (rule.type === 'homerow_mod') return { tap: { key: rule.tapKey, modifiers: [], custom: true }, hold: { kind: 'modifier', modifier: rule.modKey }, combos }
  if (rule.type === 'layer_activator') return { tap: { key: rule.tapKey ?? code, modifiers: [], custom: !!rule.tapKey }, hold: { kind: 'layer', layer: rule.layerName }, combos }
  return { tap: { key: code, modifiers: [], custom: false }, hold: { kind: 'none' }, combos }
}

/** Which modifier a hold chip means for this key: keeps the current side, else the hand the key is on. */
export function holdModifierFor(code: string, family: string, current?: string): string {
  if (family === 'hyper') return 'hyper'
  if (current && modifierFamily(current) === family) return current
  const key = LAPTOP_LAYOUT.find(k => k.code === code)
  const left = key ? key.x + (key.w ?? 1) / 2 < 7.25 : true
  return `${left ? 'left' : 'right'}_${family}`
}

/** The Hold chips for a key: Hyper shows only on Caps Lock or when it is already the value. */
export function holdChoices(code: string, hold: Hold): string[] {
  const hyper = code === 'caps_lock' || (hold.kind === 'modifier' && hold.modifier === 'hyper')
  return [...HOLD_FAMILIES, ...(hyper ? ['hyper'] : [])]
}

/** Keep the first base rule for the key and drop any later duplicates (imported profiles can have two). */
function oneBaseRule(rules: Rule[], code: string): Rule[] {
  const first = macBaseRuleIndex(rules, code)
  const isBase = (rule: Rule) => ['simple', 'layer_activator', 'homerow_mod'].includes(rule.type) && 'fromKey' in rule && rule.fromKey === code
    && (rule.type !== 'simple' || !rule.fromModifiers?.length)
  return rules.filter((rule, i) => i === first || !isBase(rule))
}

function writeBase(rules: readonly Rule[], code: string, tap: { key: string; modifiers: string[] }, hold: Hold): Rule[] {
  const before = readNativeBinding(rules, code, null)
  let binding: NativeBinding
  if (hold.kind === 'modifier') binding = { ...asBinding({ key: tap.key, modifiers: [] }), behavior: 'mt', modifier: hold.modifier }
  else if (hold.kind === 'layer') binding = { ...asBinding({ key: tap.key, modifiers: [] }), behavior: 'lt', layer: hold.layer, holdBehavior: before.behavior === 'lt' ? before.holdBehavior : 'balanced' }
  else if (tap.key === code && !tap.modifiers.length) binding = { ...asBinding(tap), behavior: 'trans' }
  else binding = asBinding(tap)
  return oneBaseRule(applyNativeBinding(rules, code, null, binding), code)
}

export function setKeyTap(rules: readonly Rule[], code: string, layer: string | null, tap: { key: string; modifiers: string[] }): Rule[] {
  if (layer !== null) return applyNativeBinding(rules, code, layer, asBinding(tap))
  const now = readKeyActions(rules, code, null)
  return writeBase(rules, code, { key: tap.key, modifiers: now.hold.kind === 'none' ? tap.modifiers : [] }, now.hold)
}

/** Remove a layer's binding so the key falls back to Base. */
export function clearLayerTap(rules: readonly Rule[], code: string, layer: string): Rule[] {
  return applyNativeBinding(rules, code, layer, { ...asBinding({ key: code, modifiers: [] }), behavior: 'trans' })
}

export function setKeyHold(rules: readonly Rule[], code: string, hold: Hold): Rule[] {
  const now = readKeyActions(rules, code, null)
  return writeBase(rules, code, { key: now.tap.key, modifiers: hold.kind === 'none' ? now.tap.modifiers : [] }, hold)
}

/** What choosing an item in the key picker means for a key + modifiers pair (symbols like ! add Shift). */
export function pickOutput(current: { key: string; modifiers: string[] }, choice: string): { key: string; modifiers: string[] } {
  const next = selectNativeKeyChoice(asBinding(current), choice)
  return { key: next.key, modifiers: next.modifiers }
}

export function toggleModifier(modifiers: readonly string[], family: string): string[] {
  return modifiers.includes(family) ? modifiers.filter(m => m !== family) : [...modifiers, family]
}

function checkOutput(toKey: string, toModifiers: readonly string[]) {
  if (!NATIVE_KEYS.includes(toKey) || toModifiers.some(mod => !NATIVE_MODIFIERS.includes(mod))) throw new Error('Pick a different key to type.')
}
const comboText = (keys: readonly string[], toKey: string, mods: readonly string[]) => `${keys.join('+')} → ${mods.length ? `${mods.join('+')}+` : ''}${toKey}`

export function addCombo(rules: readonly Rule[], code: string, partner: string, toKey: string, toModifiers: readonly string[] = []): Rule[] {
  if (partner === code) throw new Error('Pick a different key.')
  if (!NATIVE_KEYS.includes(code) || !NATIVE_KEYS.includes(partner)) throw new Error('That key can’t be part of a combo.')
  checkOutput(toKey, toModifiers)
  const keys = [code, partner]
  if (rules.some(rule => rule.type === 'combo' && rule.fromKeys.length === 2 && keys.every(key => rule.fromKeys.includes(key)))) throw new Error('These two keys already have a combo.')
  const rule: ComboRule = { type: 'combo', description: comboText(keys, toKey, toModifiers), fromKeys: keys, toKey, ...(toModifiers.length ? { toModifiers: [...toModifiers] } : {}) }
  return [...rules, rule]
}

export function setComboOutput(rules: readonly Rule[], index: number, toKey: string, toModifiers: readonly string[] = []): Rule[] {
  const rule = rules[index]
  if (rule?.type !== 'combo') throw new Error('That combo is gone.')
  checkOutput(toKey, toModifiers)
  const { toModifiers: _old, ...rest } = rule
  return rules.map((r, i) => i === index ? { ...rest, description: comboText(rule.fromKeys, toKey, toModifiers), toKey, ...(toModifiers.length ? { toModifiers: [...toModifiers] } : {}) } : r)
}

export function removeCombo(rules: readonly Rule[], index: number): Rule[] {
  return rules[index]?.type === 'combo' ? rules.filter((_, i) => i !== index) : [...rules]
}

const KEY_NAMES: Record<string, string> = {
  return_or_enter: 'Enter', escape: 'Esc', spacebar: 'Space', tab: 'Tab', caps_lock: 'Caps Lock', delete_forward: 'Forward delete',
  up_arrow: '↑', down_arrow: '↓', left_arrow: '←', right_arrow: '→', page_up: 'Page up', page_down: 'Page down',
  grave_accent_and_tilde: '` ~', hyphen: '-', equal_sign: '=', open_bracket: '[', close_bracket: ']', backslash: '\\', semicolon: ';', quote: "'",
  comma: ',', period: '.', slash: '/',
}
/** A key as a person says it: Enter, Esc, K, 5, ← (modifier keys follow the computer: Win / Alt on Windows). */
export function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code]
  if (code === 'delete_or_backspace') return isWindows() ? 'Backspace' : 'Delete'
  const side = /^(left|right)_(shift|control|option|command|alt|gui)$/.exec(code)
  if (side) return `${side[1] === 'left' ? 'Left' : 'Right'} ${modifierLong(side[2] === 'alt' ? 'option' : side[2] === 'gui' ? 'command' : side[2])}`
  if (/^[a-z]$/.test(code)) return code.toUpperCase()
  const words = code.replace(/^keypad_/, 'keypad ').replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
