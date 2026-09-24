/**
 * One keyboard, top-level: Keymap / Combos / Pointing tabs driven entirely by
 * its registry descriptor. Pointing appears only when the keyboard has a
 * pointing device.
 */
import { lazy, Suspense, useEffect, useState } from 'react'
import type { KeyboardDef } from '@/lib/registry/types'
import ZmkKeymapEditor from './ZmkKeymapEditor'
import QmkKeymapEditor from './QmkKeymapEditor'

const Pointing = lazy(() => import('@/components/Pointing'))

type Tab = 'keymap' | 'combos' | 'pointing'

interface Props {
  keyboard: KeyboardDef
  onEditInSettings: () => void
}

export default function KeyboardSection({ keyboard, onEditInSettings }: Props) {
  const [tab, setTab] = useState<Tab>('keymap')
  const hasPointing = keyboard.pointing.length > 0

  // Switching keyboards resets to the keymap tab; an unavailable tab falls back.
  useEffect(() => { setTab('keymap') }, [keyboard.id])
  useEffect(() => { if (tab === 'pointing' && !hasPointing) setTab('keymap') }, [tab, hasPointing])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <div className="section-header">
        <span className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {keyboard.name}
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>
            {keyboard.firmware.toUpperCase()}{keyboard.shield ? ` · ${keyboard.shield}` : ''} · {keyboard.layout.keys.length} keys
          </span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="seg-ctrl" role="tablist" aria-label="Keyboard sections">
            <button role="tab" aria-selected={tab === 'keymap'} className={`seg-btn${tab === 'keymap' ? ' active' : ''}`} onClick={() => setTab('keymap')}>Keymap</button>
            <button role="tab" aria-selected={tab === 'combos'} className={`seg-btn${tab === 'combos' ? ' active' : ''}`} onClick={() => setTab('combos')}>Combos</button>
            {hasPointing && (
              <button role="tab" aria-selected={tab === 'pointing'} className={`seg-btn${tab === 'pointing' ? ' active' : ''}`} onClick={() => setTab('pointing')}>
                Pointing
              </button>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onEditInSettings} title="Rename, change layout, or remove this keyboard">
            Edit…
          </button>
        </div>
      </div>

      <div style={{ padding: 24, flex: 1 }}>
        {tab === 'pointing' && hasPointing ? (
          <Suspense fallback={<div className="skeleton" style={{ height: 120 }} />}>
            <Pointing key={keyboard.id} devices={keyboard.pointing} />
          </Suspense>
        ) : keyboard.firmware === 'zmk' ? (
          <ZmkKeymapEditor key={keyboard.id} keyboard={keyboard} view={tab === 'combos' ? 'combos' : 'keymap'} />
        ) : (
          <QmkKeymapEditor key={keyboard.id} keyboard={keyboard} view={tab === 'combos' ? 'combos' : 'keymap'} />
        )}
      </div>
    </div>
  )
}
