import { MACBOOK_LAYOUT, LAPTOP_LAYOUT, type MacKey } from './macbookLayout'
import { modifierName, modifierPrefix, hyperName } from './platform'
import { nativeShiftedSymbol, isShiftModifier } from './nativeSymbols'
import { keycodeLabel } from './keyLabel'
import { macLayerNames } from './macLayerEditing'
import type { PhysicalLayout } from './layout'
import type { Rule } from './karabinerGenerator'

/** Same physical coordinates as the combo picker; PhysicalBoard supplies its normal outer padding. */
export const MAC_PHYSICAL_LAYOUT: PhysicalLayout = {
  name: 'MacBook US ANSI', source: 'legacy',
  keys: MACBOOK_LAYOUT.map(({ x, y, w, h }) => ({ x, y, w, h })),
}
/** The same for the laptop the app is running on (the Mac's is MAC_PHYSICAL_LAYOUT). */
export const LAPTOP_PHYSICAL_LAYOUT: PhysicalLayout = {
  name: LAPTOP_LAYOUT === MACBOOK_LAYOUT ? 'MacBook US ANSI' : 'Windows laptop US ANSI', source: 'legacy',
  keys: LAPTOP_LAYOUT.map(({ x, y, w, h }) => ({ x, y, w, h })),
}
export interface MacLayer { name: string | null; activators: string[]; bindings: number }
export function macLayers(rules: readonly Rule[], layerNames: readonly string[] = []): MacLayer[] {
  const named = new Map<string, MacLayer>(macLayerNames(rules, layerNames).map(name => [name, { name, activators: [], bindings: 0 }]))
  for (const rule of rules) {
    if (rule.type !== 'layer_activator' && rule.type !== 'layer_binding') continue
    const layer = named.get(rule.layerName) ?? { name: rule.layerName, activators: [], bindings: 0 }
    if (rule.type === 'layer_binding') layer.bindings++
    else if (!layer.activators.includes(rule.fromKey)) layer.activators.push(rule.fromKey)
    named.set(rule.layerName, layer)
  }
  return [{ name: null, activators: [], bindings: 0 }, ...named.values()]
}
export function validMacLayer(rules: readonly Rule[], selected: string | null, layerNames: readonly string[] = []): string | null {
  return selected !== null && macLayers(rules, layerNames).some(layer => layer.name === selected) ? selected : null
}
export function macLayerBindingIndex(rules: readonly Rule[], code: string, layer: string): number {
  return rules.findIndex(rule => rule.type === 'layer_binding' && rule.layerName === layer && rule.fromKey === code)
}
export function macBaseRuleIndex(rules: readonly Rule[], code: string): number {
  return rules.findIndex(rule => ['simple', 'layer_activator', 'homerow_mod'].includes(rule.type) && rule.type !== 'combo' && rule.fromKey === code
    && (rule.type !== 'simple' || !rule.fromModifiers?.length))
}
/** Held modifiers as a prefix for a key label: `⌃⇧` on a Mac, `Ctrl+Shift+` on Windows. */
export const macModifierLabel = (mods?: readonly string[]) => modifierPrefix(mods)
export function macKeyLabel(code: string): string {
  const aliases: Record<string, string> = { spacebar: 'SPACE', return_or_enter: 'ENTER', delete_or_backspace: 'BSPC', delete_forward: 'DELETE', grave_accent_and_tilde: 'GRAVE', open_bracket: 'LBKT', close_bracket: 'RBKT', quote: 'SQT', period: 'DOT', left_option: 'LALT', right_option: 'RALT' }
  return keycodeLabel(aliases[code] ?? code.toUpperCase())
}
export interface MacKeyFace {
  /** Big label: what a tap types. */
  label: string
  /** Small label under it: what a hold does (⌃ ⇧ ⌥ ⌘ or a layer name). Empty when nothing. */
  sub: string
  /** Spoken description of the whole key. */
  detail: string
  kind: 'normal' | 'remap' | 'layer' | 'homerow' | 'fallback'
  /** The key is part of at least one combo. */
  combo: boolean
  ruleIndex: number
}
export function macKeyFace(rules: readonly Rule[], key: MacKey, layer: string | null): MacKeyFace {
  const physical = macKeyLabel(key.code)
  const index = layer === null ? macBaseRuleIndex(rules, key.code) : macLayerBindingIndex(rules, key.code, layer)
  const combo = layer === null && rules.some(rule => rule.type === 'combo' && rule.fromKeys.includes(key.code))
  if (layer !== null && index < 0) {
    const base = macKeyFace(rules, key, null)
    return { ...base, kind: 'fallback', label: '···', sub: '', combo: false, detail: `${physical}: same as Base`, ruleIndex: -1 }
  }
  const rule = rules[index]
  let label = physical, sub = '', kind: MacKeyFace['kind'] = 'normal'
  if (rule?.type === 'simple' || rule?.type === 'layer_binding') {
    const symbol = nativeShiftedSymbol(rule.toKey, rule.toModifiers ?? [])
    const modifiers = symbol ? (rule.toModifiers ?? []).filter(mod => !isShiftModifier(mod)) : rule.toModifiers
    label = `${macModifierLabel(modifiers)}${symbol?.symbol ?? macKeyLabel(rule.toKey)}`
    kind = 'remap'
  } else if (rule?.type === 'layer_activator') {
    label = macKeyLabel(rule.tapKey ?? key.code)
    sub = rule.layerName; kind = 'layer'
  } else if (rule?.type === 'homerow_mod') {
    label = macKeyLabel(rule.tapKey)
    const family = rule.modKey.replace(/^(left|right)_/, '')
    sub = family === 'hyper' ? hyperName() : ['control', 'option', 'shift', 'command'].includes(family) ? modifierName(family) : macKeyLabel(rule.modKey)
    kind = 'homerow'
  }
  const detail = `${physical}: types ${label}${sub ? `, hold ${sub}` : ''}${combo ? ', in a combo' : ''}`
  return { label, sub, detail, kind, combo, ruleIndex: index }
}
export function macUnplacedKeys(rules: readonly Rule[]): string[] {
  const physical = new Set(LAPTOP_LAYOUT.map(key => key.code))
  return [...new Set(rules.flatMap(rule => rule.type === 'combo' ? rule.fromKeys : [rule.fromKey]))].filter(code => !physical.has(code))
}
