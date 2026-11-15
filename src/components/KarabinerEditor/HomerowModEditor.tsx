import { useState } from 'react'
import { Switch, ConfirmBanner } from '@/components/ui'
import React, { useMemo } from 'react'
import { useKarabinerStore } from '@/stores/karabinerStore'
import type { HomerowModRule } from '@/lib/karabinerGenerator'
import { HOMEROW_KEYS, HOMEROW_PRESETS, homerowRules } from '@/lib/macDefaults'
import { HOMEROW_MISFIRE_DEFAULTS } from '@/lib/karabinerGenerator'
import {
  HOLD_MODES, applyTypingFeel, chooseMode, describeTypingFeel, feelFields, holdSliderRange, holdTimeToCommit,
  isRecommendedFeel, readTypingFeel, replaceHomerowRules, type HoldMode,
} from './typingFeel'

// Mod key options shown in the picker
const MOD_OPTIONS: { modKey: string; label: string; sym: string }[] = [
  { modKey: 'left_control', label: 'Control', sym: '⌃' },
  { modKey: 'left_option', label: 'Option', sym: '⌥' },
  { modKey: 'left_shift', label: 'Shift', sym: '⇧' },
  { modKey: 'left_command', label: 'Command', sym: '⌘' },
  { modKey: 'right_control', label: 'Control', sym: '⌃' },
  { modKey: 'right_option', label: 'Option', sym: '⌥' },
  { modKey: 'right_shift', label: 'Shift', sym: '⇧' },
  { modKey: 'right_command', label: 'Command', sym: '⌘' },
]

const PRESETS = HOMEROW_PRESETS

export const HomerowModEditor: React.FC = () => {
  const { rules, addRule, removeRule, updateRule, replaceRules } = useKarabinerStore()

  // Index all current homerow mod rules by their fromKey
  const modsByKey = useMemo(() => {
    const map = new Map<string, { rule: HomerowModRule; idx: number }>()
    rules.forEach((r, i) => {
      if (r.type === 'homerow_mod') map.set(r.fromKey, { rule: r as HomerowModRule, idx: i })
    })
    return map
  }, [rules])

  const isEnabled = (key: string) => modsByKey.has(key)
  const feel = useMemo(() => readTypingFeel(rules), [rules])
  // While the slider is dragged only the draft moves; the rules (and undo history) change once, on release.
  const [draftMs, setDraftMs] = useState<number | null>(null)
  const shownMs = draftMs ?? (feel.holdMs === 'mixed' ? HOMEROW_MISFIRE_DEFAULTS.holdThresholdMs : feel.holdMs)
  const range = holdSliderRange(shownMs, feel.holdMs)
  const setMode = (holdBehavior: HoldMode) => replaceRules(chooseMode(rules, holdBehavior))
  // A pointer release on a mixed time commits what the thumb shows; key and blur events only finish a drag.
  const commitMs = (fromPointer = false) => {
    const ms = fromPointer ? holdTimeToCommit(feel, draftMs) : draftMs
    if (ms !== null) replaceRules(applyTypingFeel(rules, { holdThresholdMs: ms }))
    setDraftMs(null)
  }

  function toggle(hk: { key: string; label: string }) {
    if (isEnabled(hk.key)) {
      const entry = modsByKey.get(hk.key)!
      removeRule(entry.idx)
    } else {
      // Default mod assignment: left hand → GACS, right hand → SCAG mirror
      const defaultMod = PRESETS[0].mods[hk.key] ?? 'left_control'
      addRule({
        type: 'homerow_mod',
        description: `${hk.label}: hold → ${defaultMod.replace('left_', '⌃⌥⇧⌘'[['left_control','left_option','left_shift','left_command'].indexOf(defaultMod)] ?? '?').replace('right_', '')}, tap → ${hk.label.toLowerCase()}`,
        fromKey: hk.key,
        tapKey: hk.key === 'semicolon' ? 'semicolon' : hk.key,
        modKey: defaultMod,
        ...feelFields(feel),
      })
    }
  }

  function setMod(hk: { key: string; label: string }, modKey: string) {
    const entry = modsByKey.get(hk.key)
    if (!entry) return
    const sym = MOD_OPTIONS.find(m => m.modKey === modKey)?.sym ?? modKey
    updateRule(entry.idx, {
      ...entry.rule,
      modKey,
      description: `${hk.label}: hold → ${sym}, tap → ${hk.label.toLowerCase()}`,
    })
  }

  const [pendingPreset, setPendingPreset] = useState<typeof PRESETS[0] | 'clear' | null>(null)
  function requestPreset(preset: typeof PRESETS[0]) {
    if (modsByKey.size > 0) setPendingPreset(preset); else applyPreset(preset)
  }
  function requestClear() {
    if (modsByKey.size > 0) setPendingPreset('clear')
  }
  function applyPreset(preset: typeof PRESETS[0]) {
    // One undo step: swap the home-row rules, keeping the typing feel the person chose.
    replaceRules(replaceHomerowRules(rules, homerowRules(preset)))
  }

  function clearAll() {
    replaceRules(rules.filter(r => r.type !== 'homerow_mod'))
  }

  const enabledCount = modsByKey.size

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {pendingPreset && (
        <ConfirmBanner
          danger={pendingPreset === 'clear'}
          message={pendingPreset === 'clear' ? <>Remove all {modsByKey.size} homerow mods?</> : <>Replace the current {modsByKey.size} homerow mods with the <strong>{pendingPreset.label}</strong> preset?</>}
          confirmLabel={pendingPreset === 'clear' ? 'Remove all' : 'Replace'}
          onConfirm={() => { if (pendingPreset === 'clear') clearAll(); else applyPreset(pendingPreset); setPendingPreset(null) }}
          onCancel={() => setPendingPreset(null)}
        />
      )}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text)' }}>
            Homerow Mods {enabledCount > 0 && <span style={{ color: 'var(--accent)', fontSize: 12 }}>({enabledCount} active)</span>}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            Hold a homerow key to send a modifier. Tap it normally to type the letter.
          </p>
        </div>
        {enabledCount > 0 && (
          <button className="btn btn-danger btn-sm" onClick={requestClear}>Clear all</button>
        )}
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Presets</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map(p => (
            <button key={p.label} className="btn btn-secondary btn-sm" onClick={() => requestPreset(p)}
              title={p.desc}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Typing feel */}
      <section className="panel-inset" aria-labelledby="typing-feel-title" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h4 id="typing-feel-title" style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>Typing feel</h4>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Choose when a held key counts as ⌃ ⌥ ⇧ ⌘ instead of a letter.
          </p>
        </div>

        <div role="radiogroup" aria-label="When a hold counts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
          {HOLD_MODES.map(m => {
            const selected = feel.mode === m.id
            return (
              <button key={m.id} type="button" role="radio" aria-checked={selected} disabled={feel.count === 0}
                aria-describedby={`feel-help-${m.id}`}
                onClick={() => setMode(m.id)}
                style={{
                  textAlign: 'left', padding: '8px 10px', minHeight: 44, borderRadius: 'var(--r-md)', cursor: feel.count === 0 ? 'not-allowed' : 'pointer',
                  font: 'inherit', display: 'flex', flexDirection: 'column', gap: 3,
                  color: 'var(--text)', opacity: feel.count === 0 ? 0.5 : 1,
                  background: selected ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  transition: 'background var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out)',
                }}>
                <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {m.label}
                  {m.id === HOMEROW_MISFIRE_DEFAULTS.holdBehavior && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-hover)', border: '1px solid var(--accent)', borderRadius: 9999, padding: '0 6px' }}>Recommended</span>
                  )}
                </span>
                <span id={`feel-help-${m.id}`} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{m.help}</span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label htmlFor="typing-feel-ms" className="field-label">Hold time</label>
            <output htmlFor="typing-feel-ms" style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
              {feel.holdMs === 'mixed' && draftMs === null ? 'Mixed' : `${shownMs} ms`}
            </output>
          </div>
          <input id="typing-feel-ms" type="range" min={range.min} max={range.max} step={range.step}
            disabled={feel.count === 0} value={shownMs}
            aria-valuetext={`${shownMs} milliseconds`}
            onChange={e => setDraftMs(Number(e.target.value))}
            onPointerUp={() => commitMs(true)} onKeyUp={() => commitMs()} onBlur={() => commitMs()}
            style={{ width: '100%', accentColor: 'var(--accent)', height: 24, margin: 0 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
            <span>Quicker, more accidents</span><span>Slower, fewer accidents</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, flex: '1 1 220px' }} aria-live="polite">
            {describeTypingFeel(feel)}
          </p>
          <button type="button" className="btn btn-secondary btn-sm"
            disabled={feel.count === 0 || isRecommendedFeel(feel)}
            onClick={() => replaceRules(applyTypingFeel(rules, HOMEROW_MISFIRE_DEFAULTS))}>
            Use recommended
          </button>
        </div>
      </section>

      {/* Per-key controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['left', 'right'].map(hand => (
          <div key={hand} className="panel-inset" style={{
            flex: 1, minWidth: 200,
            padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
              {hand} hand
            </span>
            {HOMEROW_KEYS.filter(hk => hk.hand === hand).map(hk => {
              const entry = modsByKey.get(hk.key)
              const active = !!entry
              const modKey = entry?.rule.modKey ?? ''
              const modOpts = MOD_OPTIONS.filter(m => m.modKey.startsWith(hand === 'left' ? 'left_' : 'right_'))

              return (
                <div key={hk.key} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  opacity: active ? 1 : 0.5,
                  transition: 'opacity var(--dur-1) var(--ease-out)',
                }}>
                  <Switch size="sm" checked={active} onChange={() => toggle(hk)} aria-label={`Homerow mod on ${hk.label}`} />

                  {/* Key label */}
                  <span style={{
                    fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600,
                    color: active ? 'var(--text)' : 'var(--text-muted)',
                    width: 16, textAlign: 'center',
                  }}>
                    {hk.label}
                  </span>

                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>hold →</span>

                  {/* Modifier picker */}
                  <select
                    disabled={!active}
                    style={{ height: 26, fontSize: 11, opacity: active ? 1 : 0.3 }}
                    value={modKey}
                    onChange={e => setMod(hk, e.target.value)}
                  >
                    <option value="">—</option>
                    {modOpts.map(m => (
                      <option key={m.modKey} value={m.modKey}>{m.sym} {m.label}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Hint */}
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Changes here edit your profile. Nothing changes on your keyboard until you press Apply.
        Works best with touch-typing. Conflicts with combos that use the same keys.
      </p>
    </div>
  )
}

export default HomerowModEditor
