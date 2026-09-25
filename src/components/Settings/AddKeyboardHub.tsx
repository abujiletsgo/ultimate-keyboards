/**
 * Add keyboard: every way in, one screen.
 *   Plugged in      — read what is on a USB-connected keyboard (Studio / Vial / VIA)
 *   Find my keyboard — catalogue for new owners
 *   Config folder   — an existing zmk-config / QMK folder
 *   Single file     — a lone .keymap
 */
import { lazy, Suspense, useState } from 'react'
import { FolderOpen, FileText, Usb, Search, X } from 'lucide-react'
import AddKeyboard from './AddKeyboard'
import FindKeyboard from './FindKeyboard'
import type { KeyboardDef } from '@/lib/registry/types'

const PluggedIn = lazy(() => import('./PluggedIn'))

export type HubTab = 'usb' | 'find' | 'folder' | 'file'

interface Props {
  initial?: HubTab
  existingNames: string[]
  onAdd: (def: Omit<KeyboardDef, 'id' | 'createdAt'>) => void
  onClose: () => void
}

const TABS: { id: HubTab; label: string; icon: typeof Usb; hint: string }[] = [
  { id: 'find', label: 'Find my keyboard', icon: Search, hint: 'Just bought a keyboard? Pick it from the list and start from its default keymap.' },
  { id: 'usb', label: 'Plugged in', icon: Usb, hint: 'Connect it with a USB cable to read the keymap that is on it (ZMK Studio, Vial or VIA firmware).' },
  { id: 'folder', label: 'Config folder', icon: FolderOpen, hint: 'You already have a zmk-config repo or a QMK keymap folder.' },
  { id: 'file', label: 'Single file', icon: FileText, hint: 'Open one .keymap file.' },
]

export default function AddKeyboardHub({ initial = 'find', existingNames, onAdd, onClose }: Props) {
  const [tab, setTab] = useState<HubTab>(initial)
  const [picking, setPicking] = useState<'folder' | 'file' | null>(initial === 'folder' || initial === 'file' ? initial : null)
  const current = TABS.find(t => t.id === tab)!

  return (
    <div className="glass anim-fade-up" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Add a keyboard</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      <div className="seg-ctrl" role="tablist" aria-label="Ways to add a keyboard" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`seg-btn${tab === t.id ? ' active' : ''}`} onClick={() => { setTab(t.id); setPicking(null) }}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{current.hint}</div>

      {tab === 'find' && <FindKeyboard onAdd={onAdd} />}
      {tab === 'usb' && (
        <Suspense fallback={<div className="skeleton" style={{ height: 120 }} />}>
          <PluggedIn onAdd={onAdd} />
        </Suspense>
      )}
      {(tab === 'folder' || tab === 'file') && (
        picking === tab ? (
          <AddKeyboard key={tab} mode={tab} existingNames={existingNames} onAdd={onAdd} onCancel={() => setPicking(null)} />
        ) : (
          <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPicking(tab)}>
            {tab === 'folder' ? <><FolderOpen size={14} /> Choose folder…</> : <><FileText size={14} /> Choose .keymap file…</>}
          </button>
        )
      )}
    </div>
  )
}
