import { useState } from 'react'
import {
  CORNE_PROCYON_LAYOUT,
  getKeyStyle as getCPKeyStyle,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  DIVIDER_X,
} from '@/lib/corneProcyonLayout'
import BindingEditor from './BindingEditor'

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
  keys: string[]  // 44 full QMK keycode strings
  highlightedPositions?: Set<number>
  onKeyClick?: (pos: number) => void
  onBindingChange?: (pos: number, newKeycode: string) => void
}

function getColors(
  pos: number,
  behavior: QMKBehavior,
  isEncoder: boolean,
  highlighted: Set<number>,
  hovered: number | null,
) {
  if (isEncoder) return { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.2)', shadow: 'none', opacity: 1, dashed: true }
  if (highlighted.has(pos)) return { bg: 'var(--accent, #7c6aff)', border: 'rgba(255,255,255,0.3)', text: '#fff', shadow: '0 0 0 2px var(--accent, #7c6aff)', opacity: 1 }
  if (hovered === pos) return { bg: 'rgba(255,255,255,0.16)', border: 'rgba(255,255,255,0.2)', text: 'var(--text-primary, #eee)', shadow: '0 2px 6px rgba(0,0,0,0.4)', opacity: 1 }

  switch (behavior) {
    case 'trans': return { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.18)', text: 'rgba(255,255,255,0.3)', shadow: 'none', opacity: 1, dashed: true }
    case 'none':  return { bg: 'rgba(255,0,0,0.05)', border: 'rgba(255,80,80,0.2)', text: 'rgba(255,80,80,0.4)', shadow: 'none', opacity: 1, dashed: true }
    case 'layer': return { bg: 'rgba(124,106,255,0.22)', border: 'rgba(124,106,255,0.5)', text: '#c4baff', shadow: '0 0 0 1px rgba(124,106,255,0.3)', opacity: 1 }
    case 'toggle':    return { bg: 'rgba(245,158,11,0.2)', border: 'rgba(245,158,11,0.45)', text: '#fcd34d', shadow: '0 0 0 1px rgba(245,158,11,0.25)', opacity: 1 }
    case 'layer-tap': return { bg: 'rgba(124,106,255,0.12)', border: 'rgba(124,106,255,0.35)', text: '#a99fff', shadow: 'none', opacity: 1 }
    case 'mod-tap':   return { bg: 'rgba(251,146,60,0.15)', border: 'rgba(251,146,60,0.4)', text: '#fdba74', shadow: 'none', opacity: 1 }
    case 'shifted':   return { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.35)', text: '#6ee7b7', shadow: 'none', opacity: 1 }
    default: return { bg: 'rgba(255,255,255,0.09)', border: 'rgba(255,255,255,0.10)', text: 'var(--text-secondary, #aaa)', shadow: '0 1px 3px rgba(0,0,0,0.35)', opacity: 1 }
  }
}

export default function QMKKeyboard({ keys, highlightedPositions, onKeyClick, onBindingChange }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ pos: number; x: number; y: number } | null>(null)
  const highlighted = highlightedPositions ?? new Set<number>()

  return (
    <div style={{ overflowX: 'auto', padding: '16px 0' }}>
      <div style={{
        position: 'relative',
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 14,
        border: '.5px solid rgba(255,255,255,0.07)',
        boxShadow: 'var(--shadow-card, 0 4px 24px rgba(0,0,0,0.5))',
        flexShrink: 0,
      }}>
        {/* Half divider line */}
        <div style={{ position: 'absolute', left: DIVIDER_X, top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />

        {CORNE_PROCYON_LAYOUT.map(key => {
          const fullKc = keys[key.pos] ?? 'KC_TRNS'
          const isEncoder = key.isEncoder ?? false
          const behavior = getBehavior(fullKc)
          const label = isEncoder ? '◎' : abbreviateQMK(fullKc)
          const colors = getColors(key.pos, behavior, isEncoder, highlighted, hovered)
          const keyStyle = getCPKeyStyle(key)
          const labelLen = label.length

          return (
            <div
              key={key.pos}
              title={isEncoder ? 'Encoder' : fullKc}
              onClick={(e) => {
                if (isEncoder) return
                onKeyClick?.(key.pos)
                if (onBindingChange) {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setEditing({ pos: key.pos, x: rect.left, y: rect.bottom + 4 })
                }
              }}
              onMouseEnter={() => setHovered(key.pos)}
              onMouseLeave={() => setHovered(null)}
              style={{
                ...keyStyle,
                background: colors.bg,
                border: (colors as any).dashed
                  ? `1px dashed ${colors.border}`
                  : `.5px solid ${colors.border}`,
                boxShadow: colors.shadow,
                color: colors.text,
                opacity: colors.opacity,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: labelLen <= 2 ? 12 : labelLen <= 4 ? 10 : 8,
                fontWeight: 500,
                fontFamily: '-apple-system, sans-serif',
                userSelect: 'none',
                cursor: (!isEncoder && (onKeyClick || onBindingChange)) ? 'pointer' : 'default',
                transition: 'background 0.1s, box-shadow 0.1s, color 0.1s, opacity 0.1s',
                overflow: 'hidden',
              }}
            >
              {label}
            </div>
          )
        })}
      </div>
      {editing !== null && (
        <BindingEditor
          firmware="qmk"
          currentBinding={keys[editing.pos] ?? 'KC_TRNS'}
          anchorX={editing.x}
          anchorY={editing.y}
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
