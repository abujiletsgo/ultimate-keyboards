import { useState } from 'react'
import { ConfirmBanner } from '@/components/ui'
import MacbookKeyboard from './MacbookKeyboard'
import PracticeCard from './PracticeCard'
import { drillFor, drillId, triedIds } from '@/lib/practice'
import './HomerowModEditor.css'
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

export const HomerowModEditor: React.FC<{ onTurnOn: () => void }> = ({ onTurnOn }) => {
  const { rules, addRule, removeRule, updateRule, replaceRules } = useKarabinerStore()

  // Index all current homerow mod rules by their fromKey
  const modsByKey = useMemo(() => {
    const map = new Map<string, { rule: HomerowModRule; idx: number }>()
    rules.forEach((r, i) => {
      if (r.type === 'homerow_mod') map.set(r.fromKey, { rule: r as HomerowModRule, idx: i })
    })
    return map
  }, [rules])

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

  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<typeof PRESETS[0] | null>(null)

  /** Give a home-row key a modifier, change it, or (modKey null) make it a plain letter again. */
  function setKeyMod(hk: { key: string; label: string }, modKey: string | null) {
    const entry = modsByKey.get(hk.key)
    if (modKey === null) { if (entry) removeRule(entry.idx); return }
    const sym = MOD_OPTIONS.find(m => m.modKey === modKey)?.sym ?? modKey
    const description = `${hk.label}: hold → ${sym}, tap → ${hk.label.toLowerCase()}`
    const rule: HomerowModRule = entry ? { ...entry.rule, modKey, description }
      : { type: 'homerow_mod', description, fromKey: hk.key, tapKey: hk.key, modKey, ...feelFields(feel) }
    if (entry) updateRule(entry.idx, rule); else addRule(rule)
    if (drillFor(rule) && !triedIds().has(drillId(rule))) setPractice(rule)
  }
  // Try it: offered once for each new home-row key, and any time from the picker.
  const [practice, setPractice] = useState<HomerowModRule | null>(null)

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
    replaceRules(rules.filter(r => !(r.type === 'homerow_mod' && HOME_KEYS.has(r.fromKey))))
  }

  const enabledCount = HOMEROW_KEYS.filter(hk => modsByKey.has(hk.key)).length
  const selectedKey = HOMEROW_KEYS.find(hk => hk.key === selected) ?? null
  const selectedEntry = selectedKey ? modsByKey.get(selectedKey.key) ?? null : null
  const selectedMod = selectedEntry?.rule.modKey ?? null

  // What the picture shows: the preset being previewed, else the profile.
  const shownMod = (key: string) => preview ? preview.mods[key] : modsByKey.get(key)?.rule.modKey
  const badges = new Map<string, string>()
  const colors = new Map<string, string[]>()
  for (const hk of HOMEROW_KEYS) {
    const mod = shownMod(hk.key)
    if (mod) { badges.set(hk.key, symOf(mod)); colors.set(hk.key, [MOD_TAP]) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {pendingPreset && (
        <ConfirmBanner
          danger={pendingPreset === 'clear'}
          message={pendingPreset === 'clear' ? <>Turn off all {enabledCount} home-row keys?</> : <>Replace your {enabledCount} home-row keys with <strong>{pendingPreset.label}</strong>?</>}
          confirmLabel={pendingPreset === 'clear' ? 'Turn all off' : 'Replace'}
          onConfirm={() => { if (pendingPreset === 'clear') clearAll(); else applyPreset(pendingPreset); setPendingPreset(null) }}
          onCancel={() => setPendingPreset(null)}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text)' }}>Home-row keys ({enabledCount})</h3>
        {enabledCount > 0 && <button className="btn btn-danger btn-sm" onClick={requestClear}>Turn all off</button>}
      </div>

      {/* The keyboard: orange keys type a letter on tap and act as a modifier on hold. */}
      <div className="panel-inset" style={{ padding: '8px 12px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, minHeight: 28 }} aria-live="polite">
          {preview ? <>Preview: <strong style={{ color: 'var(--text)' }}>{preview.label}</strong></>
            : selectedKey ? <TapHold letter={selectedKey.label} mod={selectedMod} />
            : <><TapHold letter="F" mod="left_command" /><span>Click an orange key to change it.</span></>}
        </div>
        <MacbookKeyboard rules={rules} selectorMode keyBadges={badges} comboColors={colors}
          clickableKeys={HOME_KEYS} selectedKeys={selected ? new Set([selected]) : undefined}
          onKeyClick={key => setSelected(cur => cur === key.code ? null : key.code)} />
      </div>

      {/* Pick what the selected key does when held. */}
      {selectedKey && (
        <div className="panel-inset" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Hold <strong style={{ color: 'var(--text)' }}>{selectedKey.label}</strong> for…</span>
            {selectedEntry && drillFor(selectedEntry.rule) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPractice(selectedEntry.rule)}>Try {selectedKey.label}</button>}
          </div>
          <div role="radiogroup" aria-label={`What holding ${selectedKey.label} does`} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[null, ...MOD_OPTIONS.filter(m => m.modKey.startsWith(selectedKey.hand === 'left' ? 'left_' : 'right_')).map(m => m.modKey)].map(modKey => {
              const opt = MOD_OPTIONS.find(m => m.modKey === modKey)
              const on = selectedMod === modKey
              return (
                <button key={modKey ?? 'off'} type="button" role="radio" aria-checked={on}
                  onClick={() => setKeyMod(selectedKey, modKey)} className="hr-pick" data-on={on || undefined}
                  data-mod={modKey ? true : undefined}>
                  <span className="hr-pick-sym">{opt ? opt.sym : selectedKey.label}</span>
                  <span className="hr-pick-name">{opt ? opt.label : 'Just the letter'}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {practice && <PracticeCard key={drillId(practice)} rule={practice} onClose={() => setPractice(null)} onTurnOn={onTurnOn} />}

      {/* Ready-made sets: hover or focus to see them on the keyboard. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Ready-made sets</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {PRESETS.map(p => (
            <button key={p.label} type="button" className="hr-preset"
              onMouseEnter={() => setPreview(p)} onMouseLeave={() => setPreview(null)}
              onFocus={() => setPreview(p)} onBlur={() => setPreview(null)}
              onClick={() => { setPreview(null); requestPreset(p) }}
              aria-label={`Use ${p.label}: ${p.desc}`}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{p.label}</span>
              <span className="hr-mini" aria-hidden="true">
                {HOMEROW_KEYS.map((hk, i) => (
                  <React.Fragment key={hk.key}>
                    {i === 4 && <span className="hr-mini-gap" />}
                    <span className="hr-mini-key"><b>{hk.label}</b>{symOf(p.mods[hk.key])}</span>
                  </React.Fragment>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Typing feel */}
      <section className="panel-inset" aria-labelledby="typing-feel-title" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h4 id="typing-feel-title" style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>How long is a hold?</h4>

        <HoldTimeline ms={shownMs} disabled={feel.count === 0} />
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
            style={{ width: '100%', accentColor: MOD_TAP, height: 24, margin: 0 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
            <span>Quicker, more slips</span><span>Slower, fewer slips</span>
          </div>
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>When can a hold count early?</span>
        <div role="radiogroup" aria-label="When a hold counts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
          {HOLD_MODES.map(m => {
            const selectedMode = feel.mode === m.id
            return (
              <button key={m.id} type="button" role="radio" aria-checked={selectedMode} disabled={feel.count === 0}
                aria-describedby={`feel-help-${m.id}`} onClick={() => setMode(m.id)}
                className="hr-mode" data-on={selectedMode || undefined}>
                <ModeGlyph mode={m.id} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {m.label}
                    {m.id === HOMEROW_MISFIRE_DEFAULTS.holdBehavior && <span className="hr-badge">Recommended</span>}
                  </span>
                  <span id={`feel-help-${m.id}`} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{m.help}</span>
                </span>
              </button>
            )
          })}
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

      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Nothing changes on your keyboard until you press Apply.
      </p>
    </div>
  )
}

const MOD_TAP = '#f2a35e'
const HOME_KEYS = new Set(HOMEROW_KEYS.map(hk => hk.key))
const symOf = (modKey?: string) => MOD_OPTIONS.find(m => m.modKey === modKey)?.sym ?? ''

/** "tap F → f · hold F → ⌘" drawn as two little keys. */
function TapHold({ letter, mod }: { letter: string; mod: string | null }) {
  const opt = MOD_OPTIONS.find(m => m.modKey === mod)
  return (
    <span className="hr-taphold">
      <span className="hr-chip">tap</span><span className="hr-cap">{letter}</span><span aria-hidden="true">→</span><span className="hr-cap hr-out">{letter.toLowerCase()}</span>
      <span className="hr-chip" style={{ marginLeft: 8 }}>hold</span><span className="hr-cap">{letter}</span><span aria-hidden="true">→</span>
      {opt ? <span className="hr-cap hr-out" data-mod>{opt.sym} {opt.label}</span> : <span className="hr-cap hr-out">{letter.toLowerCase()}</span>}
    </span>
  )
}

/** A time bar: let go before the line and you get the letter, keep holding past it and you get the modifier. */
function HoldTimeline({ ms, disabled }: { ms: number; disabled: boolean }) {
  const SCALE = 500
  const pct = Math.min(100, Math.max(0, (ms / SCALE) * 100))
  return (
    <div className="hr-timeline" style={{ opacity: disabled ? 0.5 : 1 }} role="img"
      aria-label={`Let go within ${ms} milliseconds to type the letter; hold longer for the modifier.`}>
      <div className="hr-tl-bar">
        <div className="hr-tl-tap" style={{ width: `${pct}%` }}><span>let go → <b>f</b></span></div>
        <div className="hr-tl-hold"><span>keep holding → <b>⌘</b></span></div>
        <div className="hr-tl-line" style={{ left: `${pct}%` }}><span>{ms} ms</span></div>
      </div>
    </div>
  )
}

/** One small picture per hold mode: which other key can make the hold count early. */
function ModeGlyph({ mode }: { mode: HoldMode }) {
  const keys: Record<HoldMode, [string, string, string]> = {
    opposite_hand: ['F', '·', 'J'],
    balanced: ['F', '·', 'D'],
    hold_preferred: ['F', '·', 'any'],
    tap_preferred: ['F', '⏱', ''],
  }
  const [a, b, c] = keys[mode]
  return (
    <span className="hr-glyph" aria-hidden="true">
      <span className="hr-cap" data-mod>{a}</span>
      <span className="hr-glyph-mid">{b === '·' ? '+' : b}</span>
      {c && <span className="hr-cap">{c}</span>}
    </span>
  )
}

export default HomerowModEditor


