import { useState, type CSSProperties } from 'react'
import {
  CORNE_PROCYON_LAYOUT,
  getKeyStyle as getCPKeyStyle,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  DIVIDER_X,
} from '@/lib/corneProcyonLayout'
import ScaledBoard from '@/components/ScaledBoard'
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

const ENCODER_VARS = { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.2)', dashed: true }

export default function QMKKeyboard({ keys, highlightedPositions, onKeyClick, onBindingChange }: Props) {
  const [editing, setEditing] = useState<{ pos: number; x: number; y: number } | null>(null)
  const highlighted = highlightedPositions ?? new Set<number>()

  return (
    <div style={{ padding: '16px 0' }}>
      <ScaledBoard width={BOARD_WIDTH} height={BOARD_HEIGHT}>
      <div
        className="glass"
        style={{
          position: 'relative',
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          borderRadius: 16,
          flexShrink: 0,
        }}
      >
        {/* Half divider line */}
        <div style={{ position: 'absolute', left: DIVIDER_X, top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />

        {CORNE_PROCYON_LAYOUT.map(key => {
          const fullKc = keys[key.pos] ?? 'KC_TRNS'
          const isEncoder = key.isEncoder ?? false
          const behavior = getBehavior(fullKc)
          const label = isEncoder ? '◎' : abbreviateQMK(fullKc)
          const vars = isEncoder ? ENCODER_VARS : getKeyVars(behavior)
          const keyStyle = getCPKeyStyle(key)
          const isSelected = highlighted.has(key.pos)
          const labelLen = label.length

          return (
            <div
              key={key.pos}
              title={isEncoder ? 'Encoder' : fullKc}
              className={[
                'keycap',
                isSelected ? 'selected' : '',
                vars.dashed && !isSelected ? 'dashed' : '',
              ].filter(Boolean).join(' ')}
              onClick={(e) => {
                if (isEncoder) return
                onKeyClick?.(key.pos)
                if (onBindingChange) {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setEditing({ pos: key.pos, x: rect.left, y: rect.bottom + 4 })
                }
              }}
              style={{
                ...keyStyle,
                ...(isSelected ? {} : {
                  '--key-bg': vars.bg,
                  '--key-border': vars.border,
                  '--key-text': vars.text,
                }),
                fontSize: labelLen <= 2 ? 12 : labelLen <= 4 ? 10 : 8,
                cursor: (!isEncoder && (onKeyClick || onBindingChange)) ? 'pointer' : 'default',
                overflow: 'hidden',
              } as CSSProperties}
            >
              {label}
            </div>
          )
        })}
      </div>
      </ScaledBoard>
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
