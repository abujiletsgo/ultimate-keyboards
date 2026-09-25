/**
 * Add a trackpad / trackball to a ZMK keyboard from a tested template:
 *   1. pick the template   2. target files + pins   3. review the exact diffs   → Apply
 * Nothing is written until Apply; every write goes through lib/io (backup +
 * validation), and the device is registered on the keyboard afterwards so the
 * Pointing tab can tune it and remove it exactly later.
 */
import { useEffect, useMemo, useState } from 'react'
import { readText, saveText } from '@/lib/io'
import { ErrorPanel, Field, useToast } from '@/components/ui'
import { TEMPLATES, validateField, type PointingTemplate } from '@/lib/pointing/templates'
import { planAdd, unifiedDiff, type Plan, type RepoFiles } from '@/lib/pointing/apply'
import { confForOverlay, findPointingTargets, type PointingTargets } from '@/lib/pointing/targets'
import { useRegistryStore } from '@/stores/registryStore'
import type { KeyboardDef, PointingDescriptor } from '@/lib/registry/types'

interface Props {
  keyboard: KeyboardDef
  onDone: (added: PointingDescriptor | null) => void
}

type Step = 'template' | 'configure' | 'review'

function deviceId(t: PointingTemplate, existing: PointingDescriptor[]): string {
  const base = t.id
  if (!existing.some(d => d.id === base)) return base
  let n = 2
  while (existing.some(d => d.id === `${base}-${n}`)) n++
  return `${base}-${n}`
}

function short(path: string): string {
  return path.split('/').slice(-3).join('/')
}

export default function AddDeviceWizard({ keyboard, onDone }: Props) {
  const toast = useToast()
  const update = useRegistryStore(s => s.update)
  const [step, setStep] = useState<Step>('template')
  const [template, setTemplate] = useState<PointingTemplate | null>(null)
  const [targets, setTargets] = useState<PointingTargets | null>(null)
  const [overlayPath, setOverlayPath] = useState<string>('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    findPointingTargets(keyboard).then(t => { setTargets(t); if (t.overlay) setOverlayPath(t.overlay) })
  }, [keyboard])

  const id = useMemo(() => (template ? deviceId(template, keyboard.pointing) : ''), [template, keyboard.pointing])
  const errors = useMemo(() => {
    if (!template) return {}
    const out: Record<string, string> = {}
    for (const f of template.fields) { const e = validateField(f, values[f.key] ?? f.value); if (e) out[f.key] = e }
    return out
  }, [template, values])
  const valid = Object.keys(errors).length === 0 && !!overlayPath

  const choose = (t: PointingTemplate) => {
    setTemplate(t)
    setValues(Object.fromEntries(t.fields.map(f => [f.key, f.value])))
    setStep('configure')
  }

  const buildPlan = async () => {
    if (!template || !targets) return
    setPlanError(null); setBusy(true)
    try {
      const confPath = confForOverlay(overlayPath)
      const [overlay, conf, west] = await Promise.all([
        readText(overlayPath),
        readText(confPath).catch(() => ''),
        targets.westPath ? readText(targets.westPath) : Promise.resolve(null),
      ])
      const files: RepoFiles = { overlayPath, overlay, confPath, conf, westPath: targets.westPath, west }
      setPlan(planAdd(template, values, id, files))
      setStep('review')
    } catch (e) {
      setPlanError(String(e))
    } finally { setBusy(false) }
  }

  const apply = async () => {
    if (!template || !plan) return
    setBusy(true)
    try {
      // overlay first (the part the tuner reads), then conf, then west
      await saveText(plan.overlay.path, plan.overlay.after)
      if (plan.conf.after !== plan.conf.before) await saveText(plan.conf.path, plan.conf.after)
      if (plan.west && plan.west.after !== plan.west.before) await saveText(plan.west.path, plan.west.after)
      const dev: PointingDescriptor = {
        ...template.descriptor(id),
        overlayPath: plan.overlay.path,
        confPath: plan.conf.path,
        westPath: plan.west?.path,
        templateId: template.id,
      }
      update(keyboard.id, { pointing: [...keyboard.pointing, dev] })
      toast.success(`${dev.name} added — commit, rebuild and flash to use it`)
      onDone(dev)
    } catch (e) {
      toast.error(`Could not apply: ${e}`)
    } finally { setBusy(false) }
  }

  const Steps = (
    <ol className="wizard-steps" aria-label="Steps">
      {(['template', 'configure', 'review'] as Step[]).map((s, i) => (
        <li key={s} aria-current={step === s ? 'step' : undefined} data-done={['template', 'configure', 'review'].indexOf(step) > i ? 'true' : undefined}>
          <span className="wizard-step-n">{i + 1}</span>{s === 'template' ? 'Device' : s === 'configure' ? 'Pins & files' : 'Review'}
        </li>
      ))}
    </ol>
  )

  if (!keyboard.repoPath) {
    return <ErrorPanel>This keyboard has no config repo folder, so there is nowhere to add a device. Add it again from its repo folder in Settings.</ErrorPanel>
  }

  return (
    <div className="glass anim-fade-up" style={{ padding: 18, maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="section-title">Add pointing device</span>
        <span style={{ flex: 1 }} />
        {Steps}
        <button className="btn btn-ghost btn-sm" onClick={() => onDone(null)} disabled={busy}>Cancel</button>
      </div>

      {step === 'template' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {TEMPLATES.map(t => (
            <button key={t.id} className="card-btn" onClick={() => choose(t)}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.chip} · {t.bus.toUpperCase()}{t.west ? ' · west module' : ' · in-tree driver'}</span>
              {t.tested
                ? <span className="tag" style={{ alignSelf: 'flex-start', background: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.3)', color: 'var(--success)' }} title={`${t.tested.controller} · ${t.tested.zmk} · ${t.tested.source}`}>Tested · {t.tested.controller}</span>
                : <span className="tag" style={{ alignSelf: 'flex-start', background: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.3)', color: 'var(--warning)' }}>Untested — review the preview</span>}
            </button>
          ))}
        </div>
      )}

      {step === 'configure' && template && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text)' }}>{template.name}</strong>
            {template.tested ? ` — pin defaults are from the tested ${template.tested.controller} build.` : ' — no tested build for this template; check every pin against your wiring.'}
          </div>
          {!targets ? <div className="skeleton" style={{ height: 60 }} /> : targets.error ? (
            <ErrorPanel>{targets.error}</ErrorPanel>
          ) : targets.overlays.length === 0 ? (
            <ErrorPanel>No shield overlay found under config/boards/shields. This wizard writes to a shield overlay; add the shield folder to the repo first.</ErrorPanel>
          ) : (
            <Field label="Overlay (the half wired to the sensor)" hint={`conf: ${short(confForOverlay(overlayPath))}`}>
              <select className="input" value={overlayPath} onChange={e => setOverlayPath(e.target.value)} aria-label="Overlay file">
                {targets.overlays.map(p => <option key={p} value={p}>{short(p)}</option>)}
              </select>
            </Field>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {template.fields.map(f => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <input
                  className="input mono"
                  value={values[f.key] ?? f.value}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  aria-label={f.label}
                  aria-invalid={errors[f.key] ? 'true' : undefined}
                />
                {errors[f.key] && <span role="alert" style={{ fontSize: 11, color: 'var(--danger)' }}>{errors[f.key]}</span>}
              </Field>
            ))}
          </div>
          {template.west && targets && !targets.westPath && (
            <ErrorPanel>This driver lives in a west module but the repo has no config/west.yml. Create one (see the ZMK docs on modules) and try again.</ErrorPanel>
          )}
          {planError && <ErrorPanel onRetry={buildPlan}>{planError}</ErrorPanel>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setStep('template')} disabled={busy}>Back</button>
            <button className="btn btn-primary btn-sm" onClick={buildPlan} disabled={!valid || busy || !targets || (!!template.west && !targets.westPath)}>
              {busy ? 'Reading files…' : 'Preview changes'}
            </button>
          </div>
        </>
      )}

      {step === 'review' && plan && template && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            These exact changes will be written. Each block is wrapped in <span className="mono">uk:pointing:{id}</span> markers so “Remove device” can undo it byte-for-byte.
          </div>
          {[plan.overlay, plan.conf, ...(plan.west ? [plan.west] : [])].map(c => (
            <details key={c.path} open={c.after !== c.before} className="panel-inset" style={{ padding: 0 }}>
              <summary style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', gap: 8 }}>
                <span className="mono">{short(c.path)}</span>
                <span style={{ color: 'var(--text-muted)' }}>— {c.note}</span>
              </summary>
              {c.after === c.before
                ? <div style={{ padding: '4px 12px 10px', fontSize: 11, color: 'var(--text-muted)' }}>unchanged</div>
                : <pre className="diff">{unifiedDiff(c.before, c.after, short(c.path)).split('\n').map((l, i) => (
                    <div key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'diff-add' : l.startsWith('-') && !l.startsWith('---') ? 'diff-del' : l.startsWith('@@') ? 'diff-hunk' : undefined}>{l || ' '}</div>
                  ))}</pre>}
            </details>
          ))}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setStep('configure')} disabled={busy}>Back</button>
            <button className="btn btn-primary btn-sm" onClick={apply} disabled={busy}>{busy ? 'Writing…' : 'Apply'}</button>
          </div>
        </>
      )}
    </div>
  )
}
