/**
 * BindingEditor — nickcoutsos-style structured binding popover.
 *
 * Shows behavior-type pills + contextual param fields anchored to a clicked key.
 * Works for both ZMK and QMK firmware.
 */
import { useState, useEffect, useRef, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Firmware = 'zmk' | 'qmk'

interface Props {
  firmware: Firmware
  currentBinding: string   // full binding string, e.g. "&lt 1 SPACE" or "LT(1,KC_SPC)"
  anchorX: number
  anchorY: number
  onUpdate: (newBinding: string) => void
  onCancel: () => void
}

// ── ZMK behavior definitions ──────────────────────────────────────────────────

const ZMK_BEHAVIORS = [
  { code: '&kp',       label: 'Key',        title: 'Regular keypress',                        color: 'rgba(255,255,255,0.09)',  params: ['keycode'] },
  { code: '&mo',       label: 'Hold Layer', title: 'Layer active while key is held (&mo)',    color: 'rgba(124,106,255,0.25)', params: ['layer'] },
  { code: '&lt',       label: 'Tap/Hold',   title: 'Tap=key, Hold=layer (&lt)',               color: 'rgba(124,106,255,0.18)', params: ['layer', 'keycode'] },
  { code: '&mt',       label: 'Mod-tap',    title: 'Tap=key, Hold=modifier (&mt)',            color: 'rgba(251,146,60,0.2)',   params: ['modifier', 'keycode'] },
  { code: '&tog',      label: 'Toggle',     title: 'Toggle layer on/off (&tog)',              color: 'rgba(245,158,11,0.2)',   params: ['layer'] },
  { code: '&sl',       label: 'One-shot L', title: 'Next keypress uses this layer (&sl)',     color: 'rgba(251,191,36,0.18)', params: ['layer'] },
  { code: '&sk',       label: 'One-shot K', title: 'Next keypress uses this modifier (&sk)', color: 'rgba(251,191,36,0.18)', params: ['modifier'] },
  { code: '&bt',       label: 'BT',         title: 'Bluetooth action',                        color: 'rgba(56,189,248,0.2)',   params: ['bt_action'] },
  { code: '&mkp',      label: 'Mouse',      title: 'Mouse button click',                      color: 'rgba(244,114,182,0.2)', params: ['mouse_btn'] },
  { code: '&caps_word',label: 'Caps Word',  title: 'Smart caps lock until non-alpha key',     color: 'rgba(52,211,153,0.2)',  params: [] },
  { code: '&trans',    label: 'Pass-thru',  title: 'Transparent — falls through to lower layer', color: 'rgba(255,255,255,0.04)', params: [] },
  { code: '&none',     label: 'Block',      title: 'Blocked — does nothing',                  color: 'rgba(255,80,80,0.08)',  params: [] },
]

const QMK_BEHAVIORS = [
  { code: 'key',   label: 'Key',        title: 'Regular keypress',                      color: 'rgba(255,255,255,0.09)',  params: ['keycode'] },
  { code: 'mo',    label: 'Hold Layer', title: 'Layer active while held (MO)',          color: 'rgba(124,106,255,0.25)', params: ['layer'] },
  { code: 'lt',    label: 'Tap/Hold',   title: 'Tap=key, Hold=layer (LT)',              color: 'rgba(124,106,255,0.18)', params: ['layer', 'keycode'] },
  { code: 'mt',    label: 'Mod-tap',    title: 'Tap=key, Hold=modifier (MT)',           color: 'rgba(251,146,60,0.2)',   params: ['modifier', 'keycode'] },
  { code: 'tg',    label: 'Toggle',     title: 'Toggle layer on/off (TG)',              color: 'rgba(245,158,11,0.2)',   params: ['layer'] },
  { code: 'osl',   label: 'One-shot L', title: 'Next keypress uses this layer (OSL)',  color: 'rgba(251,191,36,0.18)', params: ['layer'] },
  { code: 'osm',   label: 'One-shot K', title: 'Next keypress uses this mod (OSM)',    color: 'rgba(251,191,36,0.18)', params: ['modifier'] },
  { code: 'trns',  label: 'Pass-thru',  title: 'Transparent — falls through (KC_TRNS)', color: 'rgba(255,255,255,0.04)', params: [] },
  { code: 'no',    label: 'Block',      title: 'Blocked — does nothing (KC_NO)',        color: 'rgba(255,80,80,0.08)',  params: [] },
]

// ── Param options ─────────────────────────────────────────────────────────────

const LAYERS = ['0','1','2','3','4']

const ZMK_KEYCODES = [
  ...('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
  ...([0,1,2,3,4,5,6,7,8,9].map(n => `N${n}`)),
  'SPACE','ENTER','TAB','BACKSPACE','ESC','DELETE',
  'LEFT_ARROW','RIGHT_ARROW','UP_ARROW','DOWN_ARROW',
  'COMMA','DOT','SEMI','SQT','DQT','SLASH','BACKSLASH','MINUS','EQUAL','GRAVE',
  'TILDE','LEFT_BRACKET','RIGHT_BRACKET','LEFT_BRACE','RIGHT_BRACE',
  'PIPE','COLON','EXCL','AT','HASH','DLLR','PRCNT','CARET','AMPS','ASTRK','LPAR','RPAR','PLUS','UNDER','LT','GT','QMARK',
  ...([1,2,3,4,5,6,7,8,9,10,11,12].map(n => `F${n}`)),
  'C_VOL_UP','C_VOL_DN','K_MUTE','C_PLAY_PAUSE','C_NEXT','C_PREV','C_BRIGHTNESS_INC','C_BRIGHTNESS_DEC',
]

const ZMK_MODIFIERS = [
  'LEFT_SHIFT','RIGHT_SHIFT','LEFT_ALT','RIGHT_ALT',
  'LEFT_COMMAND','RIGHT_COMMAND','LEFT_CONTROL','RIGHT_CONTROL',
]

const ZMK_BT_ACTIONS = ['BT_CLR','BT_CLR_ALL','BT_SEL 0','BT_SEL 1','BT_SEL 2','BT_SEL 3','BT_SEL 4','BT_NXT','BT_PRV']
const ZMK_MOUSE_BTNS = ['LCLK','RCLK','MCLK','MB4','MB5']

const QMK_KEYCODES = [
  ...('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => `KC_${c}`)),
  ...([0,1,2,3,4,5,6,7,8,9].map(n => `KC_${n}`)),
  'KC_SPC','KC_ENT','KC_TAB','KC_BSPC','KC_ESC','KC_DEL',
  'KC_LEFT','KC_RGHT','KC_UP','KC_DOWN',
  'KC_COMM','KC_DOT','KC_SCLN','KC_QUOT','KC_SLSH','KC_BSLS','KC_MINS','KC_EQL','KC_GRV',
  'KC_LBRC','KC_RBRC','KC_CAPS',
  ...([1,2,3,4,5,6,7,8,9,10,11,12].map(n => `KC_F${n}`)),
  'KC_MPLY','KC_MPRV','KC_MNXT','KC_MUTE','KC_VOLU','KC_VOLD','KC_BRIU','KC_BRID',
]

const QMK_MODS = ['MOD_LSFT','MOD_RSFT','MOD_LCTL','MOD_RCTL','MOD_LALT','MOD_RALT','MOD_LGUI','MOD_RGUI']

// ── Parsing ───────────────────────────────────────────────────────────────────

interface ParsedZMK { behavior: string; params: string[] }
interface ParsedQMK { type: string; params: string[] }

function parseZMK(binding: string): ParsedZMK {
  if (!binding) return { behavior: '&kp', params: ['A'] }
  const parts = binding.trim().split(/\s+/)
  const behavior = parts[0]
  const params = parts.slice(1)
  // &bt BT_SEL 0 → behavior=&bt, params=['BT_SEL 0']
  if (behavior === '&bt' && params.length >= 2) {
    return { behavior, params: [params.join(' ')] }
  }
  return { behavior, params }
}

function serializeZMK(b: string, params: string[]): string {
  if (b === '&trans' || b === '&none' || b === '&caps_word') return b
  return [b, ...params].join(' ')
}

function parseQMK(kc: string): ParsedQMK {
  if (!kc || kc === 'KC_TRNS' || kc === '_______') return { type: 'trns', params: [] }
  if (kc === 'KC_NO' || kc === 'XXXXXXX') return { type: 'no', params: [] }
  const moM = kc.match(/^MO\((\d+)\)$/)
  if (moM) return { type: 'mo', params: [moM[1]] }
  const tgM = kc.match(/^TG\((\d+)\)$/)
  if (tgM) return { type: 'tg', params: [tgM[1]] }
  const ltM = kc.match(/^LT\((\d+),(.+)\)$/)
  if (ltM) return { type: 'lt', params: [ltM[1], ltM[2]] }
  const mtM = kc.match(/^MT\(([^,]+),(.+)\)$/)
  if (mtM) return { type: 'mt', params: [mtM[1], mtM[2]] }
  const oslM = kc.match(/^OSL\((\d+)\)$/)
  if (oslM) return { type: 'osl', params: [oslM[1]] }
  const osmM = kc.match(/^OSM\((.+)\)$/)
  if (osmM) return { type: 'osm', params: [osmM[1]] }
  return { type: 'key', params: [kc] }
}

function serializeQMK(type: string, params: string[]): string {
  switch (type) {
    case 'trns': return 'KC_TRNS'
    case 'no':   return 'KC_NO'
    case 'key':  return params[0] || 'KC_A'
    case 'mo':   return `MO(${params[0] ?? '0'})`
    case 'tg':   return `TG(${params[0] ?? '0'})`
    case 'lt':   return `LT(${params[0] ?? '0'},${params[1] ?? 'KC_SPC'})`
    case 'mt':   return `MT(${params[0] ?? 'MOD_LSFT'},${params[1] ?? 'KC_SPC'})`
    case 'osl':  return `OSL(${params[0] ?? '0'})`
    case 'osm':  return `OSM(${params[0] ?? 'MOD_LSFT'})`
    default:     return params[0] || 'KC_TRNS'
  }
}

// ── Fuzzy search dropdown ─────────────────────────────────────────────────────

function ParamPicker({
  options, value, onChange,
}: { options: string[]; value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!query) return options.slice(0, 40)
    const q = query.toLowerCase()
    return options.filter(o => o.toLowerCase().includes(q)).slice(0, 40)
  }, [query, options])

  function handleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const dropH = 260
      const spaceBelow = window.innerHeight - r.bottom
      const top = spaceBelow >= dropH ? r.bottom + 4 : r.top - dropH - 4
      setDropPos({ top, left: r.left })
    }
    setOpen(v => !v)
  }

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const display = value || '—'

  return (
    <div style={{ display: 'inline-block', minWidth: 90 }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="btn btn-secondary btn-sm"
        style={{
          fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', maxWidth: 160,
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}
        title={value}
      >
        {display} ▾
      </button>
      {open && (
        <div
          ref={ref}
          className="glass-strong anim-scale-in"
          style={{
            position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 2000,
            width: 220, maxHeight: 260, display: 'flex', flexDirection: 'column',
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            onKeyDown={e => {
              if (e.key === 'Enter' && filtered.length > 0) { onChange(filtered[0]); setOpen(false); setQuery('') }
              if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
            }}
            style={{ margin: 6, fontSize: 11 }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map(opt => (
              <div
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); setQuery('') }}
                style={{
                  padding: '5px 10px', cursor: 'pointer', fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: opt === value ? 'var(--accent-hover)' : 'var(--text-secondary)',
                  background: opt === value ? 'var(--accent-soft)' : 'transparent',
                  transition: 'background var(--dur-1) var(--ease-out)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = opt === value ? 'var(--accent-soft)' : 'transparent')}
              >
                {opt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Layer number pills ────────────────────────────────────────────────────────

function LayerPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="seg-ctrl">
      {LAYERS.map(l => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={`seg-btn${value === l ? ' active' : ''}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

// ── ZMK param editor ─────────────────────────────────────────────────────────

function ZMKParamEditor({
  behavior, params, onChange,
}: { behavior: string; params: string[]; onChange: (params: string[]) => void }) {
  const bDef = ZMK_BEHAVIORS.find(b => b.code === behavior)
  if (!bDef || bDef.params.length === 0) return null

  const setParam = (i: number, v: string) => {
    const next = [...params]
    next[i] = v
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bDef.params.map((pType, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 52, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {pType === 'keycode' ? 'Key' : pType === 'layer' ? 'Layer' : pType === 'modifier' ? 'Mod' : pType === 'bt_action' ? 'Action' : 'Button'}
          </span>
          {pType === 'layer' ? (
            <LayerPicker value={params[i] ?? '0'} onChange={v => setParam(i, v)} />
          ) : pType === 'keycode' ? (
            <ParamPicker options={ZMK_KEYCODES} value={params[i] ?? ''} onChange={v => setParam(i, v)} />
          ) : pType === 'modifier' ? (
            <ParamPicker options={ZMK_MODIFIERS} value={params[i] ?? ''} onChange={v => setParam(i, v)} />
          ) : pType === 'bt_action' ? (
            <ParamPicker options={ZMK_BT_ACTIONS} value={params[i] ?? ''} onChange={v => setParam(i, v)} />
          ) : (
            <ParamPicker options={ZMK_MOUSE_BTNS} value={params[i] ?? ''} onChange={v => setParam(i, v)} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── QMK param editor ─────────────────────────────────────────────────────────

function QMKParamEditor({
  type, params, onChange,
}: { type: string; params: string[]; onChange: (params: string[]) => void }) {
  const bDef = QMK_BEHAVIORS.find(b => b.code === type)
  if (!bDef || bDef.params.length === 0) return null

  const setParam = (i: number, v: string) => {
    const next = [...params]
    next[i] = v
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bDef.params.map((pType, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 52, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {pType === 'keycode' ? 'Key' : pType === 'layer' ? 'Layer' : 'Mod'}
          </span>
          {pType === 'layer' ? (
            <LayerPicker value={params[i] ?? '0'} onChange={v => setParam(i, v)} />
          ) : pType === 'keycode' ? (
            <ParamPicker options={QMK_KEYCODES} value={params[i] ?? 'KC_A'} onChange={v => setParam(i, v)} />
          ) : (
            <ParamPicker options={QMK_MODS} value={params[i] ?? 'MOD_LSFT'} onChange={v => setParam(i, v)} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Default params when switching behavior ────────────────────────────────────

function defaultZMKParams(behavior: string): string[] {
  switch (behavior) {
    case '&kp':  return ['A']
    case '&mo':  return ['1']
    case '&tog': return ['1']
    case '&sl':  return ['1']
    case '&lt':  return ['1', 'SPACE']
    case '&mt':  return ['LEFT_SHIFT', 'SPACE']
    case '&sk':  return ['LEFT_SHIFT']
    case '&bt':  return ['BT_SEL 0']
    case '&mkp': return ['LCLK']
    default:     return []
  }
}

function defaultQMKParams(type: string): string[] {
  switch (type) {
    case 'key':  return ['KC_A']
    case 'mo':   return ['1']
    case 'tg':   return ['1']
    case 'lt':   return ['1', 'KC_SPC']
    case 'mt':   return ['MOD_LSFT', 'KC_SPC']
    case 'osl':  return ['1']
    case 'osm':  return ['MOD_LSFT']
    default:     return []
  }
}

// ── Main BindingEditor ─────────────────────────────────────────────────────────

export default function BindingEditor({ firmware, currentBinding, anchorX, anchorY, onUpdate, onCancel }: Props) {
  const behaviors = firmware === 'zmk' ? ZMK_BEHAVIORS : QMK_BEHAVIORS

  // Esc dismisses the popover (nested dropdowns stopPropagation their own Esc)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Parse current binding
  const parsed = firmware === 'zmk' ? parseZMK(currentBinding) : parseQMK(currentBinding)
  const [selBehavior, setSelBehavior] = useState('behavior' in parsed ? parsed.behavior : parsed.type)
  const [params, setParams] = useState<string[]>(parsed.params)
  const [hoveredBehavior, setHoveredBehavior] = useState<string | null>(null)

  // When behavior changes, reset params to sensible defaults
  function handleBehaviorChange(code: string) {
    setSelBehavior(code)
    const defaults = firmware === 'zmk' ? defaultZMKParams(code) : defaultQMKParams(code)
    setParams(defaults)
  }

  function handleApply() {
    const binding = firmware === 'zmk'
      ? serializeZMK(selBehavior, params)
      : serializeQMK(selBehavior, params)
    onUpdate(binding)
  }

  // Smart popover positioning
  const W = 300, MARGIN = 8
  const APPROX_H = 260
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  let left = anchorX
  if (left + W > vw - MARGIN) left = vw - W - MARGIN
  if (left < MARGIN) left = MARGIN
  const showAbove = anchorY + APPROX_H > vh - MARGIN
  const top = Math.max(MARGIN, showAbove ? anchorY - APPROX_H - 8 : anchorY)

  const selDef = behaviors.find(b => b.code === selBehavior) ?? behaviors[0]

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={onCancel} />

      {/* Popover */}
      <div
        style={{ position: 'fixed', left, top, zIndex: 1000, width: W }}
        onClick={e => e.stopPropagation()}
      >
        <div className="glass-strong anim-scale-in" style={{ overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            padding: '10px 12px 8px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Binding Type
            </div>
            {/* Behavior pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {behaviors.map(b => {
                const isActive = b.code === selBehavior
                const isHovered = hoveredBehavior === b.code
                return (
                  <button
                    key={b.code}
                    onClick={() => handleBehaviorChange(b.code)}
                    onMouseEnter={() => setHoveredBehavior(b.code)}
                    onMouseLeave={() => setHoveredBehavior(null)}
                    title={(b as any).title ?? b.label}
                    style={{
                      padding: '3px 9px', borderRadius: 20, cursor: 'pointer', fontSize: 10,
                      fontWeight: isActive ? 700 : 500,
                      background: isActive ? b.color : isHovered ? 'var(--glass-bg-hover)' : 'rgba(255,255,255,0.05)',
                      border: isActive ? `1px solid ${b.color.replace(/[\d.]+\)$/, '0.6)')}` : '1px solid var(--glass-border)',
                      color: isActive ? '#fff' : isHovered ? 'var(--text)' : 'var(--text-muted)',
                      transition: 'background var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out)',
                    }}
                  >
                    {b.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Param area */}
          <div style={{ padding: '12px 12px 10px' }}>
            {selDef.params.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No parameters needed
              </div>
            ) : firmware === 'zmk' ? (
              <ZMKParamEditor behavior={selBehavior} params={params} onChange={setParams} />
            ) : (
              <QMKParamEditor type={selBehavior} params={params} onChange={setParams} />
            )}
          </div>

          {/* Preview + Apply */}
          <div style={{
            padding: '8px 12px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.02)',
          }}>
            <code className="mono" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {firmware === 'zmk' ? serializeZMK(selBehavior, params) : serializeQMK(selBehavior, params)}
            </code>
            <button onClick={handleApply} className="btn btn-primary btn-sm">
              Apply
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
