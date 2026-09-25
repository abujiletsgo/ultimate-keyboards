/**
 * BindingEditor — nickcoutsos-style structured binding popover.
 *
 * Shows behavior-type pills + contextual param fields anchored to a clicked key.
 * Works for both ZMK and QMK firmware.
 */
import { useState, useRef, useMemo } from 'react'
import { Popover } from '@/components/ui'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Firmware = 'zmk' | 'qmk'

interface Props {
  firmware: Firmware
  currentBinding: string   // full binding string, e.g. "&lt 1 SPACE" or "LT(1,KC_SPC)"
  anchorX: number
  /** Preferred top edge of the popover (just below the clicked key) */
  anchorY: number
  /** Bottom edge to use when the popover has to flip above the key */
  anchorTop?: number
  onUpdate: (newBinding: string) => void
  onCancel: () => void
}

// ── ZMK behavior definitions ──────────────────────────────────────────────────

const ZMK_BEHAVIORS = [
  { code: '&kp',       label: 'Key',        title: 'Regular keypress',                        color: 'rgba(255,255,255,0.09)',  params: ['keycode'] },
  { code: '&user',     label: 'Custom',     title: 'A behavior or macro defined in this keymap', color: 'rgba(52,211,153,0.2)',  params: ['user'] },
  { code: '&mo',       label: 'Hold Layer', title: 'Layer active while key is held (&mo)',    color: 'rgba(96,165,250,0.25)', params: ['layer'] },
  { code: '&lt',       label: 'Tap/Hold',   title: 'Tap=key, Hold=layer (&lt)',               color: 'rgba(96,165,250,0.18)', params: ['layer', 'keycode'] },
  { code: '&mt',       label: 'Mod-tap',    title: 'Tap=key, Hold=modifier (&mt)',            color: 'rgba(251,146,60,0.2)',   params: ['modifier', 'keycode'] },
  { code: '&tog',      label: 'Toggle',     title: 'Toggle layer on/off (&tog)',              color: 'rgba(245,158,11,0.2)',   params: ['layer'] },
  { code: '&sl',       label: 'One-shot L', title: 'Next keypress uses this layer (&sl)',     color: 'rgba(251,191,36,0.18)', params: ['layer'] },
  { code: '&sk',       label: 'One-shot K', title: 'Next keypress uses this modifier (&sk)', color: 'rgba(251,191,36,0.18)', params: ['modifier'] },
  { code: '&bt',       label: 'BT',         title: 'Bluetooth action',                        color: 'rgba(56,189,248,0.2)',   params: ['bt_action'] },
  { code: '&mkp',      label: 'Mouse',      title: 'Mouse button click',                      color: 'rgba(244,114,182,0.2)', params: ['mouse_btn'] },
  { code: '&caps_word',label: 'Caps Word',  title: 'Smart caps lock until non-alpha key',     color: 'rgba(52,211,153,0.2)',  params: [] },
  { code: '&out',      label: 'Output',     title: 'Select USB/BLE output (&out)',            color: 'rgba(34,211,238,0.18)', params: ['out_action'] },
  { code: '&soft_off', label: 'Soft Off',   title: 'Power the keyboard down (&soft_off)',     color: 'rgba(251,113,133,0.15)', params: [] },
  { code: '&sys_reset',label: 'Reset',      title: 'Restart the keyboard firmware (&sys_reset)', color: 'rgba(251,113,133,0.15)', params: [] },
  { code: '&bootloader',label: 'Bootloader', title: 'Reboot into flash mode (&bootloader)',   color: 'rgba(251,113,133,0.15)', params: [] },
  { code: '&trans',    label: 'Pass-thru',  title: 'Transparent — falls through to lower layer', color: 'rgba(255,255,255,0.04)', params: [] },
  { code: '&none',     label: 'Block',      title: 'Blocked — does nothing',                  color: 'rgba(255,80,80,0.08)',  params: [] },
]

const QMK_BEHAVIORS = [
  { code: 'key',   label: 'Key',        title: 'Regular keypress',                      color: 'rgba(255,255,255,0.09)',  params: ['keycode'] },
  { code: 'mo',    label: 'Hold Layer', title: 'Layer active while held (MO)',          color: 'rgba(96,165,250,0.25)', params: ['layer'] },
  { code: 'lt',    label: 'Tap/Hold',   title: 'Tap=key, Hold=layer (LT)',              color: 'rgba(96,165,250,0.18)', params: ['layer', 'keycode'] },
  { code: 'mt',    label: 'Mod-tap',    title: 'Tap=key, Hold=modifier (MT)',           color: 'rgba(251,146,60,0.2)',   params: ['modifier', 'keycode'] },
  { code: 'tg',    label: 'Toggle',     title: 'Toggle layer on/off (TG)',              color: 'rgba(245,158,11,0.2)',   params: ['layer'] },
  { code: 'osl',   label: 'One-shot L', title: 'Next keypress uses this layer (OSL)',  color: 'rgba(251,191,36,0.18)', params: ['layer'] },
  { code: 'osm',   label: 'One-shot K', title: 'Next keypress uses this mod (OSM)',    color: 'rgba(251,191,36,0.18)', params: ['modifier'] },
  { code: 'trns',  label: 'Pass-thru',  title: 'Transparent — falls through (KC_TRNS)', color: 'rgba(255,255,255,0.04)', params: [] },
  { code: 'no',    label: 'Block',      title: 'Blocked — does nothing (KC_NO)',        color: 'rgba(255,80,80,0.08)',  params: [] },
]

// ── Param options ─────────────────────────────────────────────────────────────

import { useZMKStore } from '@/stores/zmkStore'
import { parseBehaviors, type ZmkBehavior } from '@/lib/dt/behaviors'
import { isDevicetreeReady } from '@/lib/zmkParser'
import { useQMKStore } from '@/stores/qmkStore'

/** User-defined behaviors/macros in the loaded keymap, for the "Custom" binding type. */
function useUserBehaviors(): ZmkBehavior[] {
  const src = useZMKStore(s => s.keymap?.rawSource)
  return useMemo(() => {
    if (!src || !isDevicetreeReady()) return []
    try { return parseBehaviors(src).behaviors } catch { return [] }
  }, [src])
}

/** Live layer list from the loaded keymap — labels show "N · name" */
function useLayerOptions(firmware: Firmware): { value: string; label: string }[] {
  const zmkLayers = useZMKStore(s => s.keymap?.layers)
  const qmkLayers = useQMKStore(s => s.keymap?.layers)
  const layers = firmware === 'zmk' ? zmkLayers : qmkLayers
  if (!layers || layers.length === 0) {
    return ['0', '1', '2', '3', '4'].map(v => ({ value: v, label: v }))
  }
  return layers.map((l, i) => ({
    value: String(i),
    label: `${i} · ${(l as { displayName?: string; name: string }).displayName ?? l.name}`,
  }))
}

const ZMK_KEYCODES = [
  ...('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
  ...([0,1,2,3,4,5,6,7,8,9].map(n => `N${n}`)),
  'SPACE','ENTER','TAB','BACKSPACE','ESC','DELETE','CAPSLOCK',
  'LEFT_ARROW','RIGHT_ARROW','UP_ARROW','DOWN_ARROW',
  'HOME','END','PG_UP','PG_DN','INSERT','PRINTSCREEN',
  'COMMA','DOT','SEMI','SQT','DQT','SLASH','BACKSLASH','MINUS','EQUAL','GRAVE',
  'TILDE','LEFT_BRACKET','RIGHT_BRACKET','LEFT_BRACE','RIGHT_BRACE',
  'PIPE','COLON','EXCL','AT','HASH','DLLR','PRCNT','CARET','AMPS','ASTRK','LPAR','RPAR','PLUS','UNDER','LT','GT','QMARK',
  ...([1,2,3,4,5,6,7,8,9,10,11,12].map(n => `F${n}`)),
  'C_VOL_UP','C_VOL_DN','K_MUTE','C_PLAY_PAUSE','C_NEXT','C_PREV',
  'C_BRIGHTNESS_INC','C_BRIGHTNESS_DEC','C_POWER','C_AC_SEARCH','C_AL_CONTROL_PANEL',
  'LG(C)','LG(V)','LG(X)','LG(Z)','LG(A)','LG(S)','LG(TAB)',
  'LG(LS(NUMBER_4))','LG(LS(S))','LA(TAB)','LA(PRINTSCREEN)',
]

const ZMK_MODIFIERS = [
  'LEFT_SHIFT','RIGHT_SHIFT','LEFT_ALT','RIGHT_ALT',
  'LEFT_COMMAND','RIGHT_COMMAND','LEFT_CONTROL','RIGHT_CONTROL',
]

const ZMK_BT_ACTIONS = ['BT_CLR','BT_CLR_ALL','BT_SEL 0','BT_SEL 1','BT_SEL 2','BT_SEL 3','BT_SEL 4','BT_NXT','BT_PRV']
const ZMK_OUT_ACTIONS = ['OUT_TOG','OUT_USB','OUT_BLE']
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
  // Anything not built in is a user behavior/macro: keep its label as params[0].
  if (!ZMK_BEHAVIORS.some(b => b.code === behavior)) {
    return { behavior: '&user', params: [behavior.replace(/^&/, ''), ...params] }
  }
  return { behavior, params }
}

const ZMK_ZERO_PARAM = new Set(['&trans', '&none', '&caps_word', '&soft_off', '&sys_reset', '&bootloader'])

function serializeZMK(b: string, params: string[]): string {
  if (ZMK_ZERO_PARAM.has(b)) return b
  if (b === '&user') return ['&' + (params[0] ?? ''), ...params.slice(1).filter(p => p.trim() !== '')].join(' ').trim()
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
  const [anchor, setAnchor] = useState({ x: 0, y: 0, top: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const filtered = useMemo(() => {
    if (!query) return options.slice(0, 40)
    const q = query.toLowerCase()
    return options.filter(o => o.toLowerCase().includes(q)).slice(0, 40)
  }, [query, options])

  function handleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setAnchor({ x: r.left, y: r.bottom + 4, top: r.top - 4 })
    }
    setOpen(v => !v)
  }

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
        <Popover
          anchor={anchor}
          width={220}
          layer="menu"
          noBackdrop
          label="Choose a value"
          onClose={() => setOpen(false)}
          onOutsideMouseDown={(t) => { if (!btnRef.current?.contains(t)) setOpen(false) }}
        >
        <div style={{ maxHeight: 260, display: 'flex', flexDirection: 'column' }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search or type any keycode…"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                // Prefer exact/filtered match, else accept the raw text —
                // covers modifier wraps like LG(LS(N4)) and uncommon codes
                const pick = filtered.length > 0 && !query ? filtered[0]
                  : filtered.find(o => o.toLowerCase() === query.toLowerCase()) ?? (query.trim() || filtered[0])
                if (pick) { onChange(pick); setOpen(false); setQuery('') }
              }
            }}
            style={{ margin: 6, fontSize: 11 }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Raw entry: whatever was typed is always usable */}
            {query.trim() && !filtered.some(o => o.toLowerCase() === query.trim().toLowerCase()) && (
              <div
                onClick={() => { onChange(query.trim()); setOpen(false); setQuery('') }}
                style={{
                  padding: '5px 10px', cursor: 'pointer', fontSize: 11,
                  fontFamily: 'var(--font-mono)', color: 'var(--accent)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                Use “{query.trim()}”
              </div>
            )}
            {filtered.map(opt => (
              <div
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); setQuery('') }}
                className="menu-item"
                role="option"
                aria-selected={opt === value}
              >
                {opt}
              </div>
            ))}
          </div>
          <div style={{ padding: '5px 10px', fontSize: 9.5, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            Modifier wraps work: LG(A)=⌘A · LS=⇧ · LC=⌃ · LA=⌥ — nestable
          </div>
        </div>
        </Popover>
      )}
    </div>
  )
}

// ── Layer number pills ────────────────────────────────────────────────────────

function LayerPicker({ firmware, value, onChange }: { firmware: Firmware; value: string; onChange: (v: string) => void }) {
  const layers = useLayerOptions(firmware)
  return (
    <div className="seg-ctrl" style={{ flexWrap: 'wrap' }}>
      {layers.map(l => (
        <button
          key={l.value}
          onClick={() => onChange(l.value)}
          className={`seg-btn${value === l.value ? ' active' : ''}`}
          title={l.label}
          style={{ paddingLeft: 9, paddingRight: 9 }}
        >
          {l.label}
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
  const users = useUserBehaviors()
  if (!bDef || bDef.params.length === 0) return null

  const setParam = (i: number, v: string) => {
    const next = [...params]
    next[i] = v
    onChange(next)
  }

  if (behavior === '&user') {
    const chosen = users.find(u => u.label === params[0])
    const cells = chosen?.bindingCells ?? 0
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 52, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Behavior</span>
          {users.length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>No user behaviors in this keymap yet — add one on the Behaviors tab, or type the label:</span>
          ) : (
            <select value={params[0] ?? ''} onChange={e => onChange([e.target.value, ...Array(users.find(u => u.label === e.target.value)?.bindingCells ?? 0).fill('')])} style={{ height: 28, flex: 1 }}>
              <option value="">Choose…</option>
              {users.map(u => <option key={u.label} value={u.label}>&{u.label} · {u.kind}{u.bindingCells ? ` (${u.bindingCells} param${u.bindingCells === 1 ? '' : 's'})` : ''}</option>)}
            </select>
          )}
        </div>
        {users.length === 0 && (
          <input value={params[0] ?? ''} onChange={e => setParam(0, e.target.value.replace(/^&/, ''))} placeholder="label" style={{ height: 28, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
        )}
        {Array.from({ length: cells }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 52, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Param {i + 1}</span>
            <ParamPicker options={ZMK_KEYCODES} value={params[i + 1] ?? ''} onChange={v => setParam(i + 1, v)} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bDef.params.map((pType, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 52, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {pType === 'keycode' ? 'Key' : pType === 'layer' ? 'Layer' : pType === 'modifier' ? 'Mod' : pType === 'bt_action' || pType === 'out_action' ? 'Action' : 'Button'}
          </span>
          {pType === 'layer' ? (
            <LayerPicker firmware="zmk" value={params[i] ?? '0'} onChange={v => setParam(i, v)} />
          ) : pType === 'keycode' ? (
            <ParamPicker options={ZMK_KEYCODES} value={params[i] ?? ''} onChange={v => setParam(i, v)} />
          ) : pType === 'modifier' ? (
            <ParamPicker options={ZMK_MODIFIERS} value={params[i] ?? ''} onChange={v => setParam(i, v)} />
          ) : pType === 'bt_action' ? (
            <ParamPicker options={ZMK_BT_ACTIONS} value={params[i] ?? ''} onChange={v => setParam(i, v)} />
          ) : pType === 'out_action' ? (
            <ParamPicker options={ZMK_OUT_ACTIONS} value={params[i] ?? ''} onChange={v => setParam(i, v)} />
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
            <LayerPicker firmware="qmk" value={params[i] ?? '0'} onChange={v => setParam(i, v)} />
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
    case '&out': return ['OUT_TOG']
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

export default function BindingEditor({ firmware, currentBinding, anchorX, anchorY, anchorTop, onUpdate, onCancel }: Props) {
  const behaviors = firmware === 'zmk' ? ZMK_BEHAVIORS : QMK_BEHAVIORS

  // Parse current binding
  const parsed = firmware === 'zmk' ? parseZMK(currentBinding) : parseQMK(currentBinding)
  const [selBehavior, setSelBehavior] = useState('behavior' in parsed ? parsed.behavior : parsed.type)
  const [params, setParams] = useState<string[]>(parsed.params)

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

  const selDef = behaviors.find(b => b.code === selBehavior) ?? behaviors[0]

  return (
    <Popover anchor={{ x: anchorX, y: anchorY, top: anchorTop }} width={300} label={`Edit binding ${currentBinding}`} onClose={onCancel}>
        <div style={{ overflow: 'hidden' }}>
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
                return (
                  <button
                    key={b.code}
                    onClick={() => handleBehaviorChange(b.code)}
                    title={(b as any).title ?? b.label}
                    aria-pressed={isActive}
                    className="pill"
                    style={{
                      padding: '3px 9px', borderRadius: 20, cursor: 'pointer', fontSize: 10,
                      fontWeight: isActive ? 700 : 500,
                      background: isActive ? b.color : 'rgba(255,255,255,0.05)',
                      border: isActive ? `1px solid ${b.color.replace(/[\d.]+\)$/, '0.6)')}` : '1px solid var(--glass-border)',
                      color: isActive ? '#fff' : 'var(--text-muted)',
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
    </Popover>
  )
}
