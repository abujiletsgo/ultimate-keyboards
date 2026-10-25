/** US ANSI shifted symbols. Native output always remains a keycode plus modifiers. */
export const NATIVE_SYMBOLS = [
  { symbol: '+', name: 'plus', key: 'equal_sign' },
  { symbol: '!', name: 'exclamation mark', key: '1' },
  { symbol: '@', name: 'at sign', key: '2' },
  { symbol: '#', name: 'number sign / hash', key: '3' },
  { symbol: '$', name: 'dollar sign', key: '4' },
  { symbol: '%', name: 'percent', key: '5' },
  { symbol: '^', name: 'caret', key: '6' },
  { symbol: '&', name: 'ampersand', key: '7' },
  { symbol: '*', name: 'asterisk', key: '8' },
  { symbol: '(', name: 'left parenthesis', key: '9' },
  { symbol: ')', name: 'right parenthesis', key: '0' },
  { symbol: '_', name: 'underscore', key: 'hyphen' },
  { symbol: '{', name: 'left brace', key: 'open_bracket' },
  { symbol: '}', name: 'right brace', key: 'close_bracket' },
  { symbol: '|', name: 'pipe / vertical bar', key: 'backslash' },
  { symbol: ':', name: 'colon', key: 'semicolon' },
  { symbol: '"', name: 'double quote', key: 'quote' },
  { symbol: '<', name: 'less than', key: 'comma' },
  { symbol: '>', name: 'greater than', key: 'period' },
  { symbol: '?', name: 'question mark', key: 'slash' },
  { symbol: '~', name: 'tilde', key: 'grave_accent_and_tilde' },
] as const
export const isShiftModifier = (modifier: string) => ['shift', 'left_shift', 'right_shift'].includes(modifier)
export const nativeSymbolChoice = (symbol: typeof NATIVE_SYMBOLS[number]) => `${symbol.symbol} · ${symbol.name}`
export function nativeShiftedSymbol(key: string, modifiers: readonly string[]) {
  return modifiers.some(isShiftModifier) ? NATIVE_SYMBOLS.find(symbol => symbol.key === key) : undefined
}
export function nativeSymbolFromChoice(choice: string) {
  return NATIVE_SYMBOLS.find(symbol => symbol.symbol === choice || nativeSymbolChoice(symbol) === choice)
}
