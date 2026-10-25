import { KEY_CODES, type Rule } from './karabinerGenerator'
import { NATIVE_SYMBOLS, isShiftModifier, nativeShiftedSymbol, nativeSymbolChoice, nativeSymbolFromChoice } from './nativeSymbols'
import { macBaseRuleIndex, macLayerBindingIndex } from './macKeymapView'

export type NativeBehavior = 'key' | 'mo' | 'lt' | 'mt' | 'trans'
export interface NativeBinding { behavior: NativeBehavior; key: string; modifiers: string[]; layer: string; modifier: string; holdBehavior: 'balanced' | 'hold_preferred' | 'tap_preferred' }
export const NATIVE_KEYS = [...KEY_CODES.filter(key => key !== 'fn'), ...Array.from({ length: 12 }, (_, i) => `f${i + 13}`),
  'home', 'end', 'page_up', 'page_down', 'insert', 'print_screen', 'scroll_lock', 'pause', 'non_us_backslash', 'non_us_pound', 'application',
  'keypad_num_lock', 'keypad_slash', 'keypad_asterisk', 'keypad_hyphen', 'keypad_plus', 'keypad_enter', 'keypad_period', ...Array.from({ length: 10 }, (_, i) => `keypad_${i}`),
  'left_alt', 'right_alt', 'left_gui', 'right_gui']
export const NATIVE_KEY_CHOICES = [...NATIVE_SYMBOLS.map(nativeSymbolChoice), ...NATIVE_KEYS]
export function nativeKeyChoice(binding: NativeBinding): string {
  const symbol = binding.behavior === 'key' ? nativeShiftedSymbol(binding.key, binding.modifiers) : undefined
  return symbol ? nativeSymbolChoice(symbol) : binding.key
}
/** Aliases are Key-only. Ordinary key changes preserve explicit modifiers. */
export function selectNativeKeyChoice(binding: NativeBinding, choice: string): NativeBinding {
  const symbol = nativeSymbolFromChoice(choice)
  if (symbol) {
    if (binding.behavior !== 'key') throw new Error('Shifted symbols require a Key binding; tap actions cannot include output modifiers.')
    return { ...binding, key: symbol.key, modifiers: binding.modifiers.some(isShiftModifier) ? [...binding.modifiers] : [...binding.modifiers, 'shift'] }
  }
  if (!NATIVE_KEYS.includes(choice)) throw new Error(`Unsupported native key: ${choice}`)
  // Explicitly selecting the raw base of the displayed symbol means unshifted.
  // Changing to another key (including letters) retains all explicit modifiers.
  const currentSymbol = binding.behavior === 'key' ? nativeShiftedSymbol(binding.key, binding.modifiers) : undefined
  return { ...binding, key: choice, modifiers: currentSymbol?.key === choice ? binding.modifiers.filter(mod => !isShiftModifier(mod)) : [...binding.modifiers] }
}
export const NATIVE_MODIFIERS = ['command', 'option', 'control', 'shift', 'left_command', 'right_command', 'left_option', 'right_option', 'left_control', 'right_control', 'left_shift', 'right_shift', 'alt', 'gui', 'left_alt', 'right_alt', 'left_gui', 'right_gui']
export const NATIVE_HOLD_MODIFIERS = NATIVE_MODIFIERS.filter(mod => mod.startsWith('left_') || mod.startsWith('right_'))
export function nativeBindingIndex(rules: readonly Rule[], code: string, layer: string | null) {
  return layer === null ? macBaseRuleIndex(rules, code) : macLayerBindingIndex(rules, code, layer)
}
export function readNativeBinding(rules: readonly Rule[], code: string, layer: string | null): NativeBinding {
  const rule = rules[nativeBindingIndex(rules, code, layer)]
  const binding: NativeBinding = { behavior: layer === null ? 'key' : 'trans', key: code, modifiers: [], layer: '', modifier: 'left_shift', holdBehavior: 'balanced' }
  if (!rule) return binding
  if (rule.type === 'simple' || rule.type === 'layer_binding') return { ...binding, behavior: 'key', key: rule.toKey, modifiers: [...(rule.toModifiers ?? [])] }
  if (rule.type === 'layer_activator') return { ...binding, behavior: rule.tapKey ? 'lt' : 'mo', layer: rule.layerName, key: rule.tapKey ?? code, holdBehavior: rule.holdBehavior ?? 'balanced' }
  if (rule.type === 'homerow_mod') return { ...binding, behavior: 'mt', key: rule.tapKey, modifier: rule.modKey }
  throw new Error('This imported binding is unsupported. Edit it in the rule list.')
}
export function nativeBindingError(binding: NativeBinding, code: string, layer: string | null): string | null {
  if (!NATIVE_KEYS.includes(code)) return 'This key is pass-through only; native bindings for Fn and Touch ID are not supported.'
  if (layer !== null && !['key', 'trans'].includes(binding.behavior)) return 'This layer supports Key and Pass-thru bindings.'
  if (binding.behavior === 'trans') return null
  if (['key', 'lt', 'mt'].includes(binding.behavior) && !NATIVE_KEYS.includes(binding.key)) return `Unsupported native key: ${binding.key}. Choose a supported key.`
  if (binding.behavior === 'key' && binding.modifiers.some(mod => !NATIVE_MODIFIERS.includes(mod))) return 'This binding contains an unsupported output modifier.'
  if (['mo', 'lt'].includes(binding.behavior) && (!binding.layer.trim() || new TextEncoder().encode(binding.layer).length > 64)) return 'Choose a layer with a name of at most 64 bytes.'
  if (binding.behavior === 'mt' && !NATIVE_MODIFIERS.includes(binding.modifier)) return 'Choose a supported hold modifier.'
  if (binding.behavior === 'lt' && !['balanced', 'hold_preferred', 'tap_preferred'].includes(binding.holdBehavior)) return 'Choose a supported layer timing.'
  return null
}
function directMatch(rule: Rule, code: string, layer: string | null) {
  return layer === null ? ((rule.type === 'simple' && !rule.fromModifiers?.length) || rule.type === 'layer_activator' || rule.type === 'homerow_mod') && rule.fromKey === code
    : rule.type === 'layer_binding' && rule.fromKey === code && rule.layerName === layer
}
export function nativeBindingContextError(rules: readonly Rule[], code: string): string | null {
  return rules.some(rule => 'fromKey' in rule && rule.fromKey === code && !['simple', 'combo', 'layer_activator', 'homerow_mod', 'layer_binding'].includes(rule.type))
    ? 'This key has an unsupported imported action. Review it in the rule list first.' : null
}
const VARIANT_FIELDS = ['type', 'fromKey', 'fromKeys', 'fromModifiers', 'toKey', 'toModifiers', 'tapKey', 'modKey', 'layerName', 'holdBehavior']
/** Pure working-profile edit: one replacement or atomic clearing, never runtime application. */
export function applyNativeBinding(rules: readonly Rule[], code: string, layer: string | null, binding: NativeBinding): Rule[] {
  const error = nativeBindingError(binding, code, layer)
  if (error) throw new Error(error)
  const contextError = nativeBindingContextError(rules, code)
  if (contextError) throw new Error(contextError)
  if (binding.behavior === 'trans') return rules.filter(rule => !directMatch(rule, code, layer))
  const index = nativeBindingIndex(rules, code, layer)
  const previous = index >= 0 ? rules[index] : undefined
  const metadata = previous ? structuredClone(previous) as unknown as Record<string, unknown> : {}
  for (const field of VARIANT_FIELDS) delete metadata[field]
  const common = { ...metadata, description: previous?.description ?? `${code} binding`, fromKey: code }
  let next: Rule
  if (binding.behavior === 'key') next = { ...common, type: layer === null ? 'simple' : 'layer_binding', ...(layer === null ? {} : { layerName: layer }), toKey: binding.key, ...(binding.modifiers.length ? { toModifiers: [...binding.modifiers] } : {}) } as Rule
  else if (binding.behavior === 'mt') next = { ...common, type: 'homerow_mod', tapKey: binding.key, modKey: binding.modifier }
  else next = { ...common, type: 'layer_activator', layerName: binding.layer, ...(binding.behavior === 'lt' ? { tapKey: binding.key, holdBehavior: binding.holdBehavior } : {}) }
  return index < 0 ? [...rules, next] : rules.map((rule, i) => i === index ? next : rule)
}
