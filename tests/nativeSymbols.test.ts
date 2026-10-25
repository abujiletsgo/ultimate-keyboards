import { test, expect } from 'bun:test'
import { applyNativeBinding, readNativeBinding, selectNativeKeyChoice, nativeKeyChoice, NATIVE_KEYS, NATIVE_KEY_CHOICES } from '../src/lib/nativeBinding'
import { NATIVE_SYMBOLS, nativeSymbolChoice, nativeShiftedSymbol } from '../src/lib/nativeSymbols'
import { macKeyFace } from '../src/lib/macKeymapView'
import { MACBOOK_LAYOUT } from '../src/lib/macbookLayout'
import type { Rule } from '../src/lib/karabinerGenerator'
const binding: Rule = { type: 'layer_binding', description: 'Layer1 V', layerName: 'layer1', fromKey: 'v', toKey: 'v' }
const rules: Rule[] = [
  { type: 'simple', description: 'Ctrl V', fromKey: 'v', fromModifiers: ['control'], toKey: 'escape' },
  { ...binding, metadata: { keep: true } } as Rule,
  { type: 'combo', description: 'VB', fromKeys: ['v', 'b'], toKey: 'escape' },
]
test('literal plus and named choice encode Layer1 physical V as equal_sign plus Shift, never keypad_plus or literal plus', () => {
  const original = structuredClone(rules)
  const draft = selectNativeKeyChoice(readNativeBinding(rules, 'v', 'layer1'), '+')
  expect(draft).toMatchObject({ key: 'equal_sign', modifiers: ['shift'] })
  const next = applyNativeBinding(rules, 'v', 'layer1', draft)
  expect(next).toEqual([rules[0], { ...rules[1], toKey: 'equal_sign', toModifiers: ['shift'] }, rules[2]])
  const reopened = readNativeBinding(next, 'v', 'layer1')
  expect(nativeKeyChoice(reopened)).toBe('+ · plus')
  expect(macKeyFace(next, MACBOOK_LAYOUT.find(key => key.code === 'v')!, 'layer1').label).toBe('+')
  expect(selectNativeKeyChoice(reopened, '+ · plus')).toEqual(reopened)
  expect(rules).toEqual(original)
  expect(NATIVE_KEY_CHOICES.filter(choice => choice.includes('+'))).toEqual(['+ · plus'])
  expect(NATIVE_KEY_CHOICES.filter(choice => choice.includes('plus'))).toEqual(['+ · plus', 'keypad_plus'])
})
test('alias selection preserves side-specific Shift and other modifiers without adding a second Shift', () => {
  const draft = { ...readNativeBinding(rules, 'v', 'layer1'), key: 'equal_sign', modifiers: ['right_command', 'right_shift', 'option', 'control'] }
  expect(selectNativeKeyChoice(draft, '+').modifiers).toEqual(draft.modifiers)
  const raw = selectNativeKeyChoice(draft, 'equal_sign')
  expect(raw.modifiers).toEqual(['right_command', 'option', 'control'])
  expect(nativeKeyChoice(raw)).toBe('equal_sign')
  expect(selectNativeKeyChoice(raw, '+').modifiers).toEqual(['right_command', 'option', 'control', 'shift'])
})
test('ordinary raw key changes preserve explicit Shift, including letters and changing away from an alias', () => {
  const draft = { ...readNativeBinding(rules, 'v', 'layer1'), key: 'a', modifiers: ['right_shift', 'command'] }
  expect(selectNativeKeyChoice(draft, 'b')).toMatchObject({ key: 'b', modifiers: draft.modifiers })
  expect(selectNativeKeyChoice({ ...draft, key: 'equal_sign' }, 'a')).toMatchObject({ key: 'a', modifiers: draft.modifiers })
  expect(selectNativeKeyChoice(readNativeBinding(rules, 'v', 'layer1'), 'equal_sign')).toMatchObject({ key: 'equal_sign', modifiers: [] })
})
test('all US ANSI symbol choices canonicalize to supported keys; tap actions reject unrepresentable shifted aliases', () => {
  for (const symbol of NATIVE_SYMBOLS) {
    const draft = selectNativeKeyChoice(readNativeBinding(rules, 'v', 'layer1'), nativeSymbolChoice(symbol))
    expect(NATIVE_KEYS.includes(draft.key)).toBe(true)
    expect(nativeShiftedSymbol(draft.key, draft.modifiers)?.symbol).toBe(symbol.symbol)
    expect(draft.modifiers).toEqual(['shift'])
  }
  for (const behavior of ['lt', 'mt'] as const) {
    const draft = { ...readNativeBinding(rules, 'v', null), behavior }
    expect(() => selectNativeKeyChoice(draft, '+')).toThrow('tap actions cannot include output modifiers')
  }
  expect(() => applyNativeBinding(rules, 'v', 'layer1', { ...readNativeBinding(rules, 'v', 'layer1'), key: '+' })).toThrow('Unsupported native key')
})
