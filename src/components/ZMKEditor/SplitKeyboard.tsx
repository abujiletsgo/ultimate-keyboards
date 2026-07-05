import { useState, type CSSProperties } from 'react'
import type { ZMKLayer } from '@/lib/zmkParser'
import { CROSSES_LAYOUT, getKeyStyle, BOARD_WIDTH, BOARD_HEIGHT, KEY_UNIT, KEY_GAP } from '@/lib/crossesLayout'
import ScaledBoard from '@/components/ScaledBoard'
import BindingEditor from './BindingEditor'

interface Props {
  layer: ZMKLayer | null
  highlightedPositions?: Set<number>
  onKeyClick?: (pos: number) => void
  onBindingChange?: (pos: number, newBinding: string) => void
}

function abbreviate(binding: string): string {
  if (binding === '&trans') return '···'
  if (binding === '&none') return '·'
  if (binding === '&kp SPACE') return 'SPC'
  if (binding === '&kp BACKSPACE' || binding === '&kp BSPC') return 'BSPC'
  if (binding === '&kp LEFT_SHIFT' || binding === '&kp RIGHT_SHIFT') return 'SFT'
  if (binding === '&kp CAPSLOCK' || binding === '&kp CAPS_LOCK') return 'CAPS'
  if (binding === '&kp ENTER' || binding === '&kp RETURN_OR_ENTER') return 'ENT'
  if (binding === '&kp TAB') return 'TAB'
  if (binding === '&kp ESC' || binding === '&kp ESCAPE') return 'ESC'
  if (binding === '&kp DELETE') return 'DEL'
  if (binding === '&kp LEFT_ALT' || binding === '&kp RIGHT_ALT') return 'ALT'
  if (binding === '&kp LEFT_COMMAND' || binding === '&kp RIGHT_COMMAND') return 'CMD'
  if (binding === '&kp LEFT_CONTROL' || binding === '&kp RIGHT_CONTROL') return 'CTL'
  if (binding === '&kp SEMI' || binding === '&kp SEMICOLON') return ';'
  if (binding === '&kp SQT' || binding === '&kp QUOTE') return "'"
  if (binding === '&kp COMMA') return ','
  if (binding === '&kp DOT' || binding === '&kp PERIOD') return '.'
  if (binding === '&kp FSLH' || binding === '&kp SLASH') return '/'
  if (binding === '&kp MINUS' || binding === '&kp HYPHEN') return '-'
  if (binding === '&kp EQUAL' || binding === '&kp EQUAL_SIGN') return '='
  if (binding === '&bt BT_CLR') return 'CLR'
  if (binding === '&bt BT_CLR_ALL') return 'CLR!'
  if (binding === '&soft_off') return 'OFF'
  if (binding === '&sys_reset') return 'RST'
  if (binding === '&bootloader') return 'BOOT'
  if (binding === '&out OUT_TOG') return 'OUT⇄'
  if (binding === '&out OUT_USB') return 'USB'
  if (binding === '&out OUT_BLE') return 'BLE'
  if (binding === '&mkp LCLK') return 'LC'
  if (binding === '&mkp RCLK') return 'RC'
  if (binding === '&mkp MCLK') return 'MC'
  if (binding === '&kp C_VOL_UP' || binding === '&kp C_VOLUME_UP') return 'VOL+'
  if (binding === '&kp C_VOL_DN' || binding === '&kp C_VOL_DOWN') return 'VOL-'
  if (binding === '&kp K_MUTE') return 'MUTE'
  if (binding === '&kp C_PLAY_PAUSE' || binding === 'C_PP') return 'PLAY'
  if (binding === '&kp C_NEXT') return 'NEXT'
  if (binding === '&kp C_PREV' || binding === 'C_RW') return 'PREV'

  // &kp N0..N9
  const nMatch = binding.match(/^&kp N([0-9])$/)
  if (nMatch) return nMatch[1]

  // &kp NUMBER_0..NUMBER_9
  const numMatch = binding.match(/^&kp NUMBER_([0-9])$/)
  if (numMatch) return numMatch[1]

  // &kp F1..F12
  const fMatch = binding.match(/^&kp (F(?:1[0-2]|[1-9]))$/)
  if (fMatch) return fMatch[1]

  // &kp UP_ARROW, DOWN_ARROW, LEFT_ARROW, RIGHT_ARROW
  if (binding === '&kp UP_ARROW') return '↑'
  if (binding === '&kp DOWN_ARROW') return '↓'
  if (binding === '&kp LEFT_ARROW') return '←'
  if (binding === '&kp RIGHT_ARROW') return '→'

  // &kp LG(...) → ⌘+inner
  const lgMatch = binding.match(/^&kp LG\((.+)\)$/)
  if (lgMatch) return '⌘' + lgMatch[1].slice(0, 3)

  // &kp LC(...) → ⌃+inner
  const lcMatch = binding.match(/^&kp LC\((.+)\)$/)
  if (lcMatch) return '⌃' + lcMatch[1].slice(0, 3)

  // &kp LS(...) → ⇧+inner
  const lsMatch = binding.match(/^&kp LS\((.+)\)$/)
  if (lsMatch) return '⇧' + lsMatch[1].slice(0, 3)

  // &mo N
  const moMatch = binding.match(/^&mo\s+(\d+)$/)
  if (moMatch) return 'mo' + moMatch[1]

  // &lt N X
  const ltMatch = binding.match(/^&lt\s+(\d+)\s+/)
  if (ltMatch) return 'LT' + ltMatch[1]

  // &mt X Y
  const mtMatch = binding.match(/^&mt\s+/)
  if (mtMatch) return 'MT'

  // &tog N
  const togMatch = binding.match(/^&tog\s+(\d+)$/)
  if (togMatch) return 'tog' + togMatch[1]

  // &bt BT_SEL N
  const btSelMatch = binding.match(/^&bt\s+BT_SEL\s+(\d+)$/)
  if (btSelMatch) return 'BT' + btSelMatch[1]

  // &kp X → return X (the keycode, max 4 chars)
  const kpMatch = binding.match(/^&kp\s+(.+)$/)
  if (kpMatch) return kpMatch[1].slice(0, 4)

  // Default: first 4 chars of the binding
  return binding.slice(0, 4)
}

type ZMKBehavior = 'trans' | 'none' | 'layer' | 'toggle' | 'layer-tap' | 'mod-tap' | 'sticky' | 'bluetooth' | 'mouse' | 'caps' | 'normal'

function getZMKBehavior(binding: string): ZMKBehavior {
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
function getKeyVars(binding: string): { bg?: string; border?: string; text?: string; dashed?: boolean } {
  const b = getZMKBehavior(binding)
  switch (b) {
    case 'trans':     return { bg: 'rgba(255,255,255,0.025)', border: 'rgba(255,255,255,0.10)', text: 'rgba(226,230,255,0.25)', dashed: true }
    case 'none':      return { bg: 'rgba(251,113,133,0.05)', border: 'rgba(251,113,133,0.16)', text: 'rgba(251,113,133,0.40)', dashed: true }
    case 'layer':     return { bg: 'linear-gradient(180deg, rgba(96,165,250,0.30), rgba(96,165,250,0.16))', border: 'rgba(96,165,250,0.50)', text: '#bfdbfe' }
    case 'toggle':    return { bg: 'linear-gradient(180deg, rgba(245,158,11,0.26), rgba(245,158,11,0.13))', border: 'rgba(245,158,11,0.45)', text: '#fcd34d' }
    case 'layer-tap': return { bg: 'linear-gradient(180deg, rgba(96,165,250,0.18), rgba(96,165,250,0.08))', border: 'rgba(96,165,250,0.35)', text: '#93c5fd' }
    case 'mod-tap':   return { bg: 'linear-gradient(180deg, rgba(251,146,60,0.20), rgba(251,146,60,0.09))', border: 'rgba(251,146,60,0.40)', text: '#fdba74' }
    case 'sticky':    return { bg: 'linear-gradient(180deg, rgba(251,191,36,0.20), rgba(251,191,36,0.09))', border: 'rgba(251,191,36,0.40)', text: '#fde68a' }
    case 'bluetooth': return { bg: 'linear-gradient(180deg, rgba(34,211,238,0.22), rgba(34,211,238,0.10))', border: 'rgba(34,211,238,0.42)', text: '#a5f3fc' }
    case 'mouse':     return { bg: 'linear-gradient(180deg, rgba(244,114,182,0.20), rgba(244,114,182,0.09))', border: 'rgba(244,114,182,0.40)', text: '#f9a8d4' }
    case 'caps':      return { bg: 'linear-gradient(180deg, rgba(74,222,128,0.20), rgba(74,222,128,0.09))', border: 'rgba(74,222,128,0.40)', text: '#86efac' }
    default:          return {}
  }
}

// Divider x position: centered in the split gap (left ends 6.2u, right starts 6.9u)
const DIVIDER_X = 6.55 * (KEY_UNIT + KEY_GAP)

const LEGEND = [
  { color: 'rgba(96,165,250,0.65)', label: 'Layer' },
  { color: 'rgba(245,158,11,0.60)', label: 'Toggle' },
  { color: 'rgba(251,146,60,0.55)', label: 'Mod-tap' },
  { color: 'rgba(251,191,36,0.55)', label: 'Sticky' },
  { color: 'rgba(34,211,238,0.60)', label: 'BT' },
  { color: 'rgba(244,114,182,0.55)', label: 'Mouse' },
]

export default function SplitKeyboard({ layer, highlightedPositions, onKeyClick, onBindingChange }: Props) {
  const [editing, setEditing] = useState<{ pos: number; x: number; y: number } | null>(null)
  const highlighted = highlightedPositions ?? new Set<number>()

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Legend */}
      {onBindingChange && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap', paddingLeft: 2 }}>
          {LEGEND.map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 9, height: 9, borderRadius: 3, background: color,
                boxShadow: `0 0 6px ${color}`, display: 'inline-block',
              }} />
              {label}
            </span>
          ))}
        </div>
      )}
      {onKeyClick && !onBindingChange && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, paddingLeft: 4 }}>
          Click a key to configure its position in combos
        </div>
      )}

      {/* Keyboard body — scales with its container */}
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
        <div style={{
          position: 'absolute',
          left: DIVIDER_X,
          top: '8%',
          width: 1,
          height: '84%',
          background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.10) 20%, rgba(255,255,255,0.10) 80%, transparent)',
          pointerEvents: 'none',
        }} />

        {CROSSES_LAYOUT.map(key => {
          const binding = layer?.keys[key.pos] ?? '&trans'
          const label = abbreviate(binding)
          const vars = getKeyVars(binding)
          const keyStyle = getKeyStyle(key)
          const isSelected = highlighted.has(key.pos)

          return (
            <div
              key={key.pos}
              title={binding}
              className={[
                'keycap',
                isSelected ? 'selected' : '',
                vars.dashed && !isSelected ? 'dashed' : '',
              ].filter(Boolean).join(' ')}
              onClick={(e) => {
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
                fontSize: label.length <= 3 ? 11 : label.length <= 5 ? 9 : 8,
                cursor: (onKeyClick || onBindingChange) ? 'pointer' : 'default',
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
          firmware="zmk"
          currentBinding={layer?.keys[editing.pos] ?? '&trans'}
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
