import { useState } from 'react'
import type { ZMKLayer } from '@/lib/zmkParser'
import { CROSSES_LAYOUT, getKeyStyle, BOARD_WIDTH, BOARD_HEIGHT, KEY_UNIT, KEY_GAP } from '@/lib/crossesLayout'
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

function getColors(
  pos: number,
  binding: string,
  highlighted: Set<number>,
  hovered: number | null,
) {
  if (highlighted.has(pos)) return { bg: 'var(--accent)', border: 'rgba(255,255,255,0.3)', text: '#fff', shadow: '0 0 0 2px var(--accent)', opacity: 1 }
  if (hovered === pos) return { bg: 'rgba(255,255,255,0.16)', border: 'rgba(255,255,255,0.2)', text: 'var(--text-primary, #eee)', shadow: '0 2px 6px rgba(0,0,0,0.4)', opacity: 1 }

  const b = getZMKBehavior(binding)
  switch (b) {
    case 'trans':     return { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', text: 'rgba(255,255,255,0.25)', shadow: 'none', opacity: 1, dashed: true }
    case 'none':      return { bg: 'rgba(255,0,0,0.05)', border: 'rgba(255,80,80,0.15)', text: 'rgba(255,80,80,0.35)', shadow: 'none', opacity: 1, dashed: true }
    case 'layer':     return { bg: 'rgba(124,106,255,0.22)', border: 'rgba(124,106,255,0.5)', text: '#c4baff', shadow: '0 0 0 1px rgba(124,106,255,0.3)', opacity: 1 }
    case 'toggle':    return { bg: 'rgba(245,158,11,0.2)', border: 'rgba(245,158,11,0.45)', text: '#fcd34d', shadow: '0 0 0 1px rgba(245,158,11,0.25)', opacity: 1 }
    case 'layer-tap': return { bg: 'rgba(124,106,255,0.12)', border: 'rgba(124,106,255,0.35)', text: '#a99fff', shadow: 'none', opacity: 1 }
    case 'mod-tap':   return { bg: 'rgba(251,146,60,0.15)', border: 'rgba(251,146,60,0.4)', text: '#fdba74', shadow: 'none', opacity: 1 }
    case 'sticky':    return { bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.4)', text: '#fde68a', shadow: 'none', opacity: 1 }
    case 'bluetooth': return { bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.4)', text: '#7dd3fc', shadow: 'none', opacity: 1 }
    case 'mouse':     return { bg: 'rgba(244,114,182,0.15)', border: 'rgba(244,114,182,0.4)', text: '#f9a8d4', shadow: 'none', opacity: 1 }
    case 'caps':      return { bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.4)', text: '#6ee7b7', shadow: 'none', opacity: 1 }
    default:          return { bg: 'rgba(255,255,255,0.09)', border: 'rgba(255,255,255,0.10)', text: 'var(--text-secondary)', shadow: '0 1px 3px rgba(0,0,0,0.35)', opacity: 1 }
  }
}

// Divider x position: between left col 5 (x ends at ~6.1u) and right col 6 (x starts at ~6.8u)
const DIVIDER_X = 6.35 * (KEY_UNIT + KEY_GAP)

const LEGEND = [
  { color: 'rgba(124,106,255,0.5)', label: 'Layer' },
  { color: 'rgba(245,158,11,0.45)', label: 'Toggle' },
  { color: 'rgba(251,146,60,0.4)', label: 'Mod-tap' },
  { color: 'rgba(251,191,36,0.4)', label: 'Sticky' },
  { color: 'rgba(56,189,248,0.4)', label: 'BT' },
  { color: 'rgba(244,114,182,0.4)', label: 'Mouse' },
]

export default function SplitKeyboard({ layer, highlightedPositions, onKeyClick, onBindingChange }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ pos: number; x: number; y: number } | null>(null)
  const highlighted = highlightedPositions ?? new Set<number>()

  return (
    <div style={{ overflowX: 'auto', padding: '16px 0' }}>
      {/* Legend */}
      {onBindingChange && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap', paddingLeft: 2 }}>
          {LEGEND.map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
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

      {/* Keyboard body */}
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
        <div style={{
          position: 'absolute',
          left: DIVIDER_X,
          top: 0,
          width: 1,
          height: '100%',
          background: 'rgba(255,255,255,0.06)',
          pointerEvents: 'none',
        }} />

        {CROSSES_LAYOUT.map(key => {
          const binding = layer?.keys[key.pos] ?? '&trans'
          const label = abbreviate(binding)
          const colors = getColors(key.pos, binding, highlighted, hovered)
          const keyStyle = getKeyStyle(key)

          return (
            <div
              key={key.pos}
              title={binding}
              onClick={(e) => {
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
                fontSize: label.length <= 3 ? 11 : label.length <= 5 ? 9 : 8,
                fontWeight: 500,
                fontFamily: '-apple-system, sans-serif',
                userSelect: 'none',
                cursor: (onKeyClick || onBindingChange) ? 'pointer' : 'default',
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
