import { useState } from 'react'
import BindingEditor from './BindingEditor'
import PhysicalBoard, { type KeyVisual } from '@/components/board/PhysicalBoard'
import { BoardLegend } from '@/components/ui'
import { LEGACY_CORNE_PROCYON, type PhysicalLayout } from '@/lib/layout'

// ── Behavior type detection ───────────────────────────────────────────────────
type QMKBehavior = 'trans' | 'none' | 'layer' | 'layer-tap' | 'mod-tap' | 'toggle' | 'shifted' | 'normal'

function getBehavior(kc: string): QMKBehavior {
  if (kc === 'KC_TRNS' || kc === '_______') return 'trans'
  if (kc === 'KC_NO' || kc === 'XXXXXXX') return 'none'
  if (/^MO\(\d+\)$/.test(kc)) return 'layer'
  if (/^TG\(\d+\)$/.test(kc)) return 'toggle'
  if (/^LT\(/.test(kc)) return 'layer-tap'
  if (/^MT\(/.test(kc)) return 'mod-tap'
  if (/^[SL]?(GUI|CTL|SFT|ALT)\(/.test(kc)) return 'shifted'
  return 'normal'
}

// ── Human-readable abbreviation ───────────────────────────────────────────────
export function abbreviateQMK(kc: string): string {
  if (!kc) return ''
  if (kc === 'KC_TRNS' || kc === '_______') return '···'
  if (kc === 'KC_NO' || kc === 'XXXXXXX') return '·'

  // Layer tap: LT(1,KC_SPC) → LT1
  const ltM = kc.match(/^LT\((\d+),/)
  if (ltM) return `LT${ltM[1]}`

  // Momentary: MO(2) → mo2
  const moM = kc.match(/^MO\((\d+)\)$/)
  if (moM) return `mo${moM[1]}`

  // Toggle: TG(2) → TG2
  const tgM = kc.match(/^TG\((\d+)\)$/)
  if (tgM) return `TG${tgM[1]}`

  // Mod-tap: MT(MOD_LSFT,KC_SPC) → MT
  if (/^MT\(/.test(kc)) return 'MT'

  // Modifier wraps
  const sguiM = kc.match(/^SGUI\((.+)\)$/)
  if (sguiM) return 'S⌘' + abbreviateQMK(sguiM[1]).slice(0, 2)
  const lguiM = kc.match(/^LGUI\((.+)\)$/)
  if (lguiM) return '⌘' + abbreviateQMK(lguiM[1]).slice(0, 3)
  const lctlM = kc.match(/^LCTL\((.+)\)$/)
  if (lctlM) return '^' + abbreviateQMK(lctlM[1]).slice(0, 3)
  const lsftM = kc.match(/^[LS]SFT\((.+)\)$/)
  if (lsftM) return '⇧' + abbreviateQMK(lsftM[1]).slice(0, 3)
  const saltM = kc.match(/^LALT\((.+)\)$/)
  if (saltM) return '⌥' + abbreviateQMK(saltM[1]).slice(0, 3)

  // S(KC_X) shifted
  const sM = kc.match(/^S\(KC_(.+)\)$/)
  if (sM) return '⇧' + sM[1].slice(0, 3)

  // KC_ prefix
  const kcM = kc.match(/^KC_(.+)$/)
  if (kcM) {
    const k = kcM[1]
    const map: Record<string, string> = {
      SPC: 'SPC', ENT: 'ENT', ENTER: 'ENT', BSPC: 'BSPC', ESC: 'ESC',
      TAB: 'TAB', DEL: 'DEL', CAPS: 'CAPS', INS: 'INS',
      LSFT: 'SFT', RSFT: 'SFT', LCTL: 'CTL', RCTL: 'CTL',
      LALT: 'ALT', RALT: 'ALT', LGUI: 'CMD', RGUI: 'CMD',
      UP: '↑', DOWN: '↓', LEFT: '←', RGHT: '→',
      MPLY: '▶', MPRV: '⏮', MNXT: '⏭', MUTE: 'MUTE',
      VOLU: 'VOL+', VOLD: 'VOL-', BRIU: 'BRI+', BRID: 'BRI-',
      SCLN: ';', QUOT: "'", COMM: ',', DOT: '.', SLSH: '/',
      MINS: '-', EQL: '=', LBRC: '[', RBRC: ']', BSLS: '\\',
      GRV: '`', TILD: '~', EXLM: '!', AT: '@', HASH: '#',
      DLR: '$', PERC: '%', CIRC: '^', AMPR: '&', ASTR: '*',
      LPRN: '(', RPRN: ')', UNDS: '_', PLUS: '+', LCBR: '{',
      RCBR: '}', PIPE: '|', COLN: ':', DQUO: '"', LABK: '<',
      RABK: '>', QUES: '?', BTN1: 'MB1', BTN2: 'MB2', BTN3: 'MB3',
      BTN4: 'MB4', BTN5: 'MB5', PWR: 'PWR',
    }
    if (map[k]) return map[k]
    // F-keys
    if (/^F\d{1,2}$/.test(k)) return k
    // Single letter/digit
    if (/^[A-Z0-9]$/.test(k)) return k
    return k.slice(0, 5)
  }

  // Custom keycodes
  if (kc === 'GUI_SEARCH') return '⌘?'

  return kc.slice(0, 5)
}

interface Props {
  keys: string[]  // one full QMK keycode string per layout position
  /** Physical layout to draw; defaults to the legacy Corne Procyon geometry. */
  layout?: PhysicalLayout
  highlightedPositions?: Set<number>
  onKeyClick?: (pos: number) => void
  onBindingChange?: (pos: number, newKeycode: string) => void
}

/** Per-behavior key colors, injected into .keycap via CSS custom props */
function getKeyVars(behavior: QMKBehavior): { bg?: string; border?: string; text?: string; dashed?: boolean } {
  switch (behavior) {
    case 'trans':     return { bg: 'rgba(255,255,255,0.025)', border: 'rgba(255,255,255,0.10)', text: 'rgba(226,230,255,0.25)', dashed: true }
    case 'none':      return { bg: 'rgba(251,113,133,0.05)', border: 'rgba(251,113,133,0.16)', text: 'rgba(251,113,133,0.40)', dashed: true }
    case 'layer':     return { bg: 'linear-gradient(180deg, rgba(96,165,250,0.30), rgba(96,165,250,0.16))', border: 'rgba(96,165,250,0.50)', text: '#bfdbfe' }
    case 'toggle':    return { bg: 'linear-gradient(180deg, rgba(245,158,11,0.26), rgba(245,158,11,0.13))', border: 'rgba(245,158,11,0.45)', text: '#fcd34d' }
    case 'layer-tap': return { bg: 'linear-gradient(180deg, rgba(96,165,250,0.18), rgba(96,165,250,0.08))', border: 'rgba(96,165,250,0.35)', text: '#93c5fd' }
    case 'mod-tap':   return { bg: 'linear-gradient(180deg, rgba(251,146,60,0.20), rgba(251,146,60,0.09))', border: 'rgba(251,146,60,0.40)', text: '#fdba74' }
    case 'shifted':   return { bg: 'linear-gradient(180deg, rgba(52,211,153,0.20), rgba(52,211,153,0.09))', border: 'rgba(52,211,153,0.40)', text: '#6ee7b7' }
    default:          return {}
  }
}


export default function QMKKeyboard({ keys, layout = LEGACY_CORNE_PROCYON, highlightedPositions, onKeyClick, onBindingChange }: Props) {
  const [editing, setEditing] = useState<{ pos: number; x: number; y: number; top: number } | null>(null)
  const highlighted = highlightedPositions ?? new Set<number>()

  const keyAt = (pos: number): KeyVisual => {
    const fullKc = keys[pos] ?? 'KC_TRNS'
    const behavior = getBehavior(fullKc)
    const label = abbreviateQMK(fullKc)
    const vars = getKeyVars(behavior)
    const sub = behavior === 'layer' ? 'hold layer' : behavior === 'layer-tap' ? 'tap/hold layer' : behavior === 'mod-tap' ? 'mod-tap' : behavior === 'toggle' ? 'toggle' : behavior === 'shifted' ? 'shifted' : undefined
    return {
      label, sub, title: fullKc,
      bg: vars.bg, border: vars.border, text: vars.text, dashed: vars.dashed,
      fontSize: label.length <= 2 ? (sub ? 11 : 12) : label.length <= 4 ? 10 : 8,
    }
  }

  return (
    <div style={{ padding: '16px 0' }}>
      {onBindingChange && <BoardLegend />}
      <PhysicalBoard
        label="QMK keymap"
        layout={layout}
        keyAt={keyAt}
        selected={highlighted}
        editable={!!(onKeyClick || onBindingChange)}
        onKeyClick={(pos, el) => {
          onKeyClick?.(pos)
          if (onBindingChange) {
            const rect = el.getBoundingClientRect()
            setEditing({ pos, x: rect.left, y: rect.bottom + 4, top: rect.top - 4 })
          }
        }}
      />
      {editing !== null && (
        <BindingEditor
          firmware="qmk"
          currentBinding={keys[editing.pos] ?? 'KC_TRNS'}
          anchorX={editing.x}
          anchorY={editing.y}
          anchorTop={editing.top}
          onUpdate={(v) => {
            onBindingChange?.(editing.pos, v)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
