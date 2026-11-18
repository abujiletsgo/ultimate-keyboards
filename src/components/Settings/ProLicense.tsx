/** Settings › Pro: what Pro adds, and the box to paste a license key. Checked offline. */
import { useEffect, useId, useState } from 'react'
import { Check } from 'lucide-react'
import { useLicenseStore } from '@/lib/license/store'
import { FREE_FEATURES, PRO_FEATURES, PRO_PRICE } from '@/lib/license/features'
import { VENDOR } from '@/lib/license/vendor'
import { ErrorPanel } from '@/components/ui'

const list = (o: Record<string, string>) => Object.values(o)

export default function ProLicense() {
  const { loaded, license, savedProblem, load, enter, remove } = useLicenseStore()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()

  useEffect(() => { if (!loaded) load() }, [loaded, load])

  const unlock = async () => {
    setBusy(true); setError(null)
    try {
      const r = await enter(key)
      if (r.ok) setKey('')
      else setError(r.message)
    } catch (e) {
      setError(`Could not save your key: ${e}`)
    } finally { setBusy(false) }
  }

  if (license) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
      <div role="status" style={{ color: 'var(--success)', fontWeight: 600 }}>Pro is on. Thank you!</div>
      <p style={{ color: 'var(--text-secondary)' }}>Licensed to <strong style={{ color: 'var(--text)' }}>{license.email}</strong></p>
      <FeatureList items={list(PRO_FEATURES)} />
      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => remove()}>Remove key from this Mac</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
      <div>
        <p><strong>Pro</strong> is {PRO_PRICE}. It adds:</p>
        <div style={{ marginTop: 8 }}><FeatureList items={list(PRO_FEATURES)} /></div>
      </div>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Everything else stays free: {list(FREE_FEATURES).join(', ').toLowerCase()}.
      </p>
      {!VENDOR.checkoutUrl && <p style={{ color: 'var(--text-muted)' }}>Buying Pro opens soon.</p>}

      <div className="field">
        <label className="field-label" htmlFor={inputId}>License key</label>
        <textarea
          id={inputId}
          className="mono"
          rows={3}
          value={key}
          placeholder="UK1-…"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onChange={e => { setKey(e.target.value); setError(null) }}
          style={{ fontSize: 11, resize: 'vertical', wordBreak: 'break-all' }}
        />
        <span className="field-hint">Paste the key from your purchase email. It is checked on this Mac, no internet needed.</span>
      </div>
      <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={unlock} disabled={busy || !key.trim()}>
        {busy ? 'Checking…' : 'Unlock Pro'}
      </button>
      <div aria-live="polite">
        {error && <ErrorPanel>{error}</ErrorPanel>}
        {!error && savedProblem && <ErrorPanel>Your saved key stopped working. {savedProblem}</ErrorPanel>}
      </div>
    </div>
  )
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(t => (
        <li key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Check size={14} aria-hidden style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}
