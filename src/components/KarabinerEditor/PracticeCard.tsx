import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Rule } from '@/lib/karabinerGenerator'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { createNativeProfile, nativeCanApply, nativeIsRunning, nativeRemapping, useNativeRemapping } from '@/lib/nativeRemapping'
import { MOD_NAME, MOD_SYM, drillFor, drillId, judge, markTried, stepKeyLabel, type Step, type Verdict } from '@/lib/practice'
import './PracticeCard.css'

const HINT: Record<Exclude<Verdict, 'ok' | 'ignore'>, (step: Step) => string> = {
  wrong: step => step.kind === 'letter' ? `Type ${step.char}.` : step.kind === 'combo' ? `Press ${step.keys.map(stepKeyLabel).join(' and ')} together.` : `Hold ${stepKeyLabel(step.key)}, then tap ${stepKeyLabel(step.partner)}.`,
  split: step => step.kind === 'combo' ? `That typed the letters. Press ${step.keys.map(stepKeyLabel).join(' and ')} at the same moment.` : '',
  short: step => step.kind === 'hold' ? `That typed ${stepKeyLabel(step.key).toLowerCase()}. Keep ${stepKeyLabel(step.key)} down a little longer.` : '',
}

/**
 * Try it: one short line to type with a new combo or home-row key. Shows once per new move (and from a Try button).
 * It only works with the real keys turned on, so when they aren't, it says why and offers the one tap that fixes it.
 */
export default function PracticeCard({ rule, onClose, onTurnOn }: { rule: Rule; onClose: () => void; onTurnOn: () => void }) {
  const drill = drillFor(rule)
  const { rules, profileTitle } = useKarabinerStore()
  const native = useNativeRemapping()
  const [at, setAt] = useState(0)
  const [hint, setHint] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const pad = useRef<HTMLDivElement>(null)

  const running = nativeIsRunning(native.status)
  const applied = native.appliedProfile?.rules
  // After a relaunch the app has no record of what was applied, only that remapping runs: trust the saved keys.
  const inApplied = !applied || applied.some(r => drillId(r) === drillId(rule))
  const live = running && inApplied
  const done = drill !== null && at >= drill.steps.length

  useEffect(() => { if (live && !done) pad.current?.focus() }, [live, done])
  if (!drill) return null

  const close = () => { markTried(drill.id); onClose() }
  const again = () => { setAt(0); setHint(null); pad.current?.focus() }
  const applyNow = () => { void nativeRemapping.apply(createNativeProfile(profileTitle, structuredClone(rules))).catch(() => {}) }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!live || done || e.key === 'Tab') return
    e.preventDefault()
    const verdict = judge(drill!.steps[at], e)
    if (verdict === 'ignore') return
    if (verdict === 'ok') {
      const next = at + 1
      setAt(next); setHint(null)
      if (next >= drill!.steps.length) markTried(drill!.id)
      return
    }
    setHint(HINT[verdict](drill!.steps[at]))
    setShake(n => n + 1)
  }

  const title = drill.steps.at(-1)!.kind === 'combo' ? 'Try your combo' : 'Try your home-row key'

  return (
    <section className="practice panel-inset" aria-label={title} data-live={live || undefined}>
      <div className="practice-head">
        <h4>{done ? 'You did it' : title}</h4>
        <button type="button" className="btn btn-ghost btn-sm practice-x" onClick={close} aria-label={done ? 'Close' : 'Skip'}>
          {done ? <X size={14} aria-hidden="true" /> : 'Skip'}
        </button>
      </div>

      <div ref={pad} className="practice-line" tabIndex={live && !done ? 0 : -1} onKeyDown={onKeyDown}
        role="group" aria-label={live ? 'Type the line. Keys go here.' : 'Practice line'} onClick={() => pad.current?.focus()}>
        {drill.steps.map((step, i) => (
          <Token key={`${i}-${i === at ? shake : 0}`} step={step} state={i < at ? 'done' : i === at && live ? 'now' : 'todo'} shook={i === at && shake > 0 && hint !== null} />
        ))}
      </div>

      <p className="practice-say" aria-live="polite">
        {done ? <>That's it. It works the same everywhere on your Mac. <button type="button" className="practice-link" onClick={again}>Again</button></>
          : !live ? <NotOn running={running} canApply={nativeCanApply(native.status)} busy={native.busy === 'apply'} onApply={applyNow} onTurnOn={onTurnOn} />
          : hint ?? 'Type the line, left to right.'}
      </p>
      {native.error && !live && <p className="practice-say" role="alert" style={{ color: 'var(--danger)' }}>{native.error}</p>}
    </section>
  )
}

function Token({ step, state, shook }: { step: Step; state: 'done' | 'now' | 'todo'; shook: boolean }) {
  const cls = `practice-tok practice-${state}${shook ? ' practice-shake' : ''}`
  if (step.kind === 'letter') return <span className={cls} aria-label={`${step.char}${state === 'done' ? ', done' : ''}`}><kbd>{step.char}</kbd></span>
  if (step.kind === 'combo') return (
    <span className={`${cls} practice-move`} data-kind="combo" aria-label={`${step.keys.map(stepKeyLabel).join(' and ')} together, gives ${step.outLabel}${state === 'done' ? ', done' : ''}`}>
      {step.keys.map((k, i) => <span key={k} className="practice-pair">{i > 0 && <i>+</i>}<kbd>{stepKeyLabel(k)}</kbd></span>)}
      <i aria-hidden="true">→</i><b>{step.outLabel}</b>
    </span>
  )
  return (
    <span className={`${cls} practice-move`} data-kind="hold" aria-label={`Hold ${stepKeyLabel(step.key)} for ${MOD_NAME[step.mod]}, tap ${stepKeyLabel(step.partner)}${state === 'done' ? ', done' : ''}`}>
      <span className="practice-hold"><small>hold</small><kbd>{stepKeyLabel(step.key)}</kbd></span><i>+</i><kbd>{stepKeyLabel(step.partner)}</kbd>
      <i aria-hidden="true">→</i><b>{MOD_SYM[step.mod]}{stepKeyLabel(step.partner)}</b>
    </span>
  )
}

/** Why the line can't be typed yet, with the one tap that fixes it. */
function NotOn({ running, canApply, busy, onApply, onTurnOn }: { running: boolean; canApply: boolean; busy: boolean; onApply: () => void; onTurnOn: () => void }) {
  if (running) return <>This change isn't on your keys yet. <button type="button" className="practice-link" disabled={busy} onClick={onApply}>{busy ? 'Applying…' : 'Apply and try'}</button></>
  if (canApply) return <>Your keys aren't remapped right now. <button type="button" className="practice-link" disabled={busy} onClick={onApply}>{busy ? 'Turning on…' : 'Turn on and try'}</button></>
  return <>Remapping needs a one-time setup first. <button type="button" className="practice-link" onClick={onTurnOn}>Set it up</button></>
}
