export type KeyBehavior = 'trans' | 'none' | 'layer' | 'toggle' | 'layer-tap' | 'mod-tap' | 'combo' | 'sticky' | 'bluetooth' | 'mouse' | 'caps' | 'shifted' | 'normal'

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

/** Per-behavior key colours, injected into .keycap via CSS custom props.
 *  The same look as the website (hyly.world/keyboards, Tom 2026-11-14): every key is a dark cap; a role shows as a
 *  coloured rim and a coloured sub-label (orange mod-tap, blue layer, purple combo), never as a tinted fill. */
export function keyBehaviorVars(b: KeyBehavior): { bg?: string; border?: string; text?: string; accent?: string; dashed?: boolean } {
  const role = (c: string) => ({ border: c, accent: c })
  switch (b) {
    case 'trans':     return { bg: 'transparent', border: 'rgba(255,255,255,0.12)', text: 'rgba(216,216,220,0.32)', dashed: true }
    case 'none':      return { bg: 'transparent', border: 'rgba(251,113,133,0.28)', text: 'rgba(251,113,133,0.55)', dashed: true }
    case 'layer':     return { ...role('#5fc8ec'), bg: 'linear-gradient(180deg, #1c2a33, #142028)', text: '#bfe9f7' }
    case 'layer-tap': return role('#5fc8ec')
    case 'toggle':    return role('#f5b942')
    case 'mod-tap':   return role('#f2a35e')
    case 'combo':     return role('#a48cf5')
    case 'shifted':   return role('#4fd1a5')
    case 'sticky':    return role('#f5d061')
    case 'bluetooth': return role('#3fc9e4')
    case 'mouse':     return role('#f08ac2')
    case 'caps':      return role('#6ee7a0')
    default:          return {}
  }
}

/** Shared label hierarchy and behavior palette for physical keyboard renderers. */
export function semanticKeyVisual(kind: KeyBehavior, label: string, sub?: string, title?: string) {
  return { label, sub, title, ...keyBehaviorVars(kind), fontSize: label.length <= 3 ? (sub ? 10 : 11) : label.length <= 5 ? 9 : 8 }
}
