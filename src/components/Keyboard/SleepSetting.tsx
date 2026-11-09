/**
 * Deep-sleep timeout for a ZMK keyboard (single board or every part of a
 * split). Writes the .conf files the build actually merges (lib/zmkSleepFiles)
 * and records them on the keyboard so Build commits them.
 */
import { useCallback, useEffect, useState } from 'react'
import { saveText } from '@/lib/io'
import { useToast } from '@/components/ui'
import { useRegistryStore } from '@/stores/registryStore'
import { loadSleepParts } from '@/lib/zmkSleepFiles'
import { partLabel, partSleep, planSleep, sameSleep, sleepLabel, DEFAULT_TIMEOUT_MS, type Part, type Sleep } from '@/lib/zmkSleep'
import type { KeyboardDef } from '@/lib/registry/types'
import { viewCache } from '@/lib/viewCache'

const MIN = 60_000
const CHOICES: Sleep[] = [
  { kind: 'after', ms: 5 * MIN },
  { kind: 'after', ms: 15 * MIN },
  { kind: 'after', ms: 30 * MIN },
  { kind: 'after', ms: 60 * MIN },
  { kind: 'after', ms: 120 * MIN },
  { kind: 'never' },
]
const key = (s: Sleep) => (s.kind === 'never' ? 'never' : String(s.ms))
const fromKey = (k: string): Sleep => (k === 'never' ? { kind: 'never' } : { kind: 'after', ms: Number(k) })

export default function SleepSetting({ keyboard, onSaved, reload }: { keyboard: KeyboardDef; onSaved: () => void; reload: number }) {
  const toast = useToast()
  const update = useRegistryStore(s => s.update)
  // The last read draws in the first frame when the Build tab reopens; the load below refreshes it.
  const cacheKey = `sleep:${keyboard.id}:${keyboard.repoPath ?? ''}`
  const [parts, setParts] = useState<Part[] | null>(() => viewCache.get<Part[]>(cacheKey) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try { setParts(viewCache.set(cacheKey, await loadSleepParts(keyboard))); setError(null) } catch (e) { setError(String(e)); setParts([]) }
  }, [keyboard, cacheKey])
  useEffect(() => { load() }, [load, reload])

  if (parts && parts.length === 0 && !error) return null

  const states = parts?.map(p => ({ name: p.name, sleep: partSleep(p) })) ?? []
  const uniform = states.length > 0 && states.every(s => sameSleep(s.sleep, states[0].sleep))
  const current = uniform ? states[0].sleep : null
  const options = current && !CHOICES.some(c => sameSleep(c, current)) ? [...CHOICES, current] : CHOICES
  const names = states.map(s => s.name)

  const choose = async (want: Sleep) => {
    if (!parts) return
    setSaving(true)
    try {
      const edits = planSleep(parts, want)
      for (const e of edits) await saveText(e.path, e.after)
      const confPaths = [...new Set([...(keyboard.confPaths ?? []), ...edits.map(e => e.path)])]
      if (confPaths.length !== (keyboard.confPaths ?? []).length) update(keyboard.id, { confPaths })
      toast.success(want.kind === 'never' ? 'Deep sleep turned off. Build and flash to apply.' : `Sleeps after ${sleepLabel(want)}. Build and flash to apply.`)
      await load()
      onSaved()
    } catch (e) {
      toast.error(`Could not save the sleep setting: ${e instanceof Error ? e.message : e}`)
    } finally { setSaving(false) }
  }

  return (
    <section className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label htmlFor="sleep-after" style={{ flex: 1, fontSize: 12 }}>Deep sleep after no input</label>
        {parts === null ? <div className="skeleton" style={{ height: 30, width: 140 }} /> : (
          <select id="sleep-after" value={current ? key(current) : ''} disabled={saving} onChange={e => e.target.value && choose(fromKey(e.target.value))} style={{ height: 30, minWidth: 140 }}>
            {!current && <option value="">Differs per half</option>}
            {options.map(o => (
              <option key={key(o)} value={key(o)}>{sleepLabel(o)}{o.kind === 'after' && o.ms === DEFAULT_TIMEOUT_MS ? ' (ZMK default)' : ''}</option>
            ))}
          </select>
        )}
      </div>
      {error && <div className="panel-inset error-panel" role="alert">{error}</div>}
      {!uniform && states.length > 1 && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {states.map(s => `${partLabel(s.name, names)}: ${sleepLabel(s.sleep).toLowerCase()}`).join(' · ')}. Choosing one sets {states.length === 2 ? 'both halves' : `all ${states.length} parts`}.
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Asleep, the keyboard turns Bluetooth off. Waking takes a few seconds{states.length > 1 ? ', each half wakes on its own key press,' : ''} and the first key press is lost.
      </div>
    </section>
  )
}
