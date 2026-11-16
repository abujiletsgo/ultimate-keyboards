import { useState } from 'react'
import { modifierName } from '@/lib/platform'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { HOMEROW_MISFIRE_DEFAULTS } from '@/lib/karabinerGenerator'
import {
  HOLD_MODES, applyTypingFeel, chooseMode, describeTypingFeel, holdSliderRange, holdTimeToCommit,
  isRecommendedFeel, readTypingFeel, type HoldMode,
} from './typingFeel'
import './TypingFeel.css'

const MOD_TAP = '#f2a35e'

/** How a held home-row key decides between its letter and its modifier. Lives under Remapping > Advanced. */
export default function TypingFeelPanel() {
  const { rules, replaceRules } = useKarabinerStore()
  const feel = readTypingFeel(rules)
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
  return (
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
        <div className="hr-tl-hold"><span>keep holding → <b>{modifierName('command')}</b></span></div>
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

