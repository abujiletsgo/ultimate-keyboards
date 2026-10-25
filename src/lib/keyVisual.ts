export type KeyBehavior = 'trans' | 'none' | 'layer' | 'toggle' | 'layer-tap' | 'mod-tap' | 'sticky' | 'bluetooth' | 'mouse' | 'caps' | 'shifted' | 'normal'

export function getZMKBehavior(binding: string): KeyBehavior {
  if (binding === '&trans') return 'trans'
  if (binding === '&none') return 'none'
  if (binding === '&caps_word') return 'caps'
  if (binding.startsWith('&mo ')) return 'layer'
  if (binding.startsWith('&tog ')) return 'toggle'
  if (binding.startsWith('&lt ')) return 'layer-tap'
  if (binding.startsWith('&mt ')) return 'mod-tap'
  if (binding.startsWith('&sl ') || binding.startsWith('&sk ')) return 'sticky'
  if (binding.startsWith('&bt ')) return 'bluetooth'
  if (binding.startsWith('&mkp ')) return 'mouse'
  return 'normal'
}

/** Per-behavior key colors, injected into .keycap via CSS custom props */
export function keyBehaviorVars(b: KeyBehavior): { bg?: string; border?: string; text?: string; dashed?: boolean } {
  switch (b) {
    case 'trans':     return { bg: 'rgba(255,255,255,0.025)', border: 'rgba(255,255,255,0.10)', text: 'rgba(226,230,255,0.25)', dashed: true }
    case 'none':      return { bg: 'rgba(251,113,133,0.05)', border: 'rgba(251,113,133,0.16)', text: 'rgba(251,113,133,0.40)', dashed: true }
    case 'layer':     return { bg: 'linear-gradient(180deg, rgba(96,165,250,0.30), rgba(96,165,250,0.16))', border: 'rgba(96,165,250,0.50)', text: '#bfdbfe' }
    case 'toggle':    return { bg: 'linear-gradient(180deg, rgba(245,158,11,0.26), rgba(245,158,11,0.13))', border: 'rgba(245,158,11,0.45)', text: '#fcd34d' }
    case 'layer-tap': return { bg: 'linear-gradient(180deg, rgba(96,165,250,0.18), rgba(96,165,250,0.08))', border: 'rgba(96,165,250,0.35)', text: '#93c5fd' }
    case 'mod-tap':   return { bg: 'linear-gradient(180deg, rgba(251,146,60,0.20), rgba(251,146,60,0.09))', border: 'rgba(251,146,60,0.40)', text: '#fdba74' }
    case 'shifted':   return { bg: 'linear-gradient(180deg, rgba(52,211,153,0.20), rgba(52,211,153,0.09))', border: 'rgba(52,211,153,0.40)', text: '#6ee7b7' }
    case 'sticky':    return { bg: 'linear-gradient(180deg, rgba(251,191,36,0.20), rgba(251,191,36,0.09))', border: 'rgba(251,191,36,0.40)', text: '#fde68a' }
    case 'bluetooth': return { bg: 'linear-gradient(180deg, rgba(34,211,238,0.22), rgba(34,211,238,0.10))', border: 'rgba(34,211,238,0.42)', text: '#a5f3fc' }
    case 'mouse':     return { bg: 'linear-gradient(180deg, rgba(244,114,182,0.20), rgba(244,114,182,0.09))', border: 'rgba(244,114,182,0.40)', text: '#f9a8d4' }
    case 'caps':      return { bg: 'linear-gradient(180deg, rgba(74,222,128,0.20), rgba(74,222,128,0.09))', border: 'rgba(74,222,128,0.40)', text: '#86efac' }
    default:          return {}
  }
}

/** Shared label hierarchy and behavior palette for physical keyboard renderers. */
export function semanticKeyVisual(kind: KeyBehavior, label: string, sub?: string, title?: string) {
  return { label, sub, title, ...keyBehaviorVars(kind), fontSize: label.length <= 3 ? (sub ? 10 : 11) : label.length <= 5 ? 9 : 8 }
}
