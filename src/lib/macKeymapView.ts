import { MACBOOK_LAYOUT, type MacKey } from './macbookLayout'
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
const MODS: Record<string, string> = { command: '⌘', option: '⌥', control: '⌃', shift: '⇧', fn: 'fn' }
export const macModifierLabel = (mods?: readonly string[]) => (mods ?? []).map(mod => MODS[mod.replace(/^(left|right)_/, '')] ?? mod).join('')
export function macKeyLabel(code: string): string {
  const aliases: Record<string, string> = { spacebar: 'SPACE', return_or_enter: 'ENTER', delete_or_backspace: 'BSPC', delete_forward: 'DELETE', grave_accent_and_tilde: 'GRAVE', open_bracket: 'LBKT', close_bracket: 'RBKT', quote: 'SQT', period: 'DOT', left_option: 'LALT', right_option: 'RALT' }
  return keycodeLabel(aliases[code] ?? code.toUpperCase())
}
export interface MacKeyFace {
  label: string; sub: string; detail: string
  kind: 'normal' | 'remap' | 'layer' | 'layer-tap' | 'homerow' | 'fallback' | 'conflict'
  ruleIndex: number; conditional: boolean; shadowedBy?: number
}
export function macKeyFace(rules: readonly Rule[], key: MacKey, layer: string | null): MacKeyFace {
  const physical = macKeyLabel(key.code)
  const baseIndex = macBaseRuleIndex(rules, key.code)
  const index = layer === null ? baseIndex : macLayerBindingIndex(rules, key.code, layer)
  const conditional = rules.some(rule => (rule.type === 'simple' && rule.fromKey === key.code && !!rule.fromModifiers?.length)
    || (rule.type === 'combo' && rule.fromKeys.includes(key.code)))
  if (layer !== null && index < 0) {
    const base = macKeyFace(rules, key, null)
    return { ...base, kind: 'fallback', label: '···', sub: 'pass', detail: `${physical}: Base fallback. ${base.detail}`, ruleIndex: -1 }
  }
  const rule = rules[index]
  const combo = rules.some(rule => rule.type === 'combo' && rule.fromKeys.includes(key.code))
  const modifierRule = rules.find(rule => rule.type === 'simple' && rule.fromKey === key.code && !!rule.fromModifiers?.length)
  let label = physical, sub = combo ? 'Combo' : modifierRule?.type === 'simple' ? `If ${macModifierLabel(modifierRule.fromModifiers)}` : '', kind: MacKeyFace['kind'] = 'normal'
  if (rule?.type === 'simple' || rule?.type === 'layer_binding') {
    const symbol = nativeShiftedSymbol(rule.toKey, rule.toModifiers ?? [])
    const modifiers = symbol ? (rule.toModifiers ?? []).filter(mod => !isShiftModifier(mod)) : rule.toModifiers
    label = `${macModifierLabel(modifiers)}${symbol?.symbol ?? macKeyLabel(rule.toKey)}`
    sub = modifiers?.length ? 'shortcut' : ''; kind = 'remap'
  } else if (rule?.type === 'layer_activator') {
    label = rule.tapKey ? macKeyLabel(rule.tapKey) : rule.layerName
    sub = rule.tapKey ? `hold ${rule.layerName}` : 'hold'; kind = rule.tapKey ? 'layer-tap' : 'layer'
  } else if (rule?.type === 'homerow_mod') {
    label = macKeyLabel(rule.tapKey)
    sub = `hold ${macKeyLabel(rule.modKey)}`; kind = 'homerow'
  }
  const shadowedBy = layer !== null && index >= 0 && baseIndex >= 0 && baseIndex < index ? baseIndex : undefined
  const detail = `${physical}: ${rule ? rule.description : 'Original key'}${conditional ? '. Modifier or combo rules also apply; this is a configured preview.' : ''}`
  return { label, sub: shadowedBy !== undefined ? 'Order !' : sub,
    detail: shadowedBy !== undefined ? `${detail}. Configured layer binding follows earlier Base rule ${shadowedBy + 1}; inspect rule order.` : detail,
    kind: shadowedBy !== undefined ? 'conflict' : kind, ruleIndex: index, conditional, shadowedBy }
}
export function macUnplacedKeys(rules: readonly Rule[]): string[] {
  const physical = new Set(MACBOOK_LAYOUT.map(key => key.code))
  return [...new Set(rules.flatMap(rule => rule.type === 'combo' ? rule.fromKeys : [rule.fromKey]))].filter(code => !physical.has(code))
}
