import { useState } from 'react'

interface LayerOption { key: string; name: string; title?: string }
interface Props {
  layers: LayerOption[]
  selected: number
  onSelect: (index: number) => void
  onAdd: (name: string) => string | null
  onRename: (name: string) => string | null
  onDelete: () => void
  editable?: boolean
  canRename?: boolean
  canDelete?: boolean
  label?: string
  idPrefix?: string
  panelId?: string
  /** ZMK keeps its existing identifier normalization; native validates explicitly. */
  normalizeName?: (name: string) => string
  accessibleLayerNames?: boolean
}
export default function LayerControls({ layers, selected, onSelect, onAdd, onRename, onDelete, editable = true, canRename = true, canDelete = true, label = 'Layers', idPrefix = 'keymap-layer', panelId, normalizeName = value => value.trim(), accessibleLayerNames = false }: Props) {
  const [mode, setMode] = useState<'add' | 'rename' | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cancel = () => { setMode(null); setValue(''); setError(null) }
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
    <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginRight: 4 }}>Layer:</span>
    <div className="seg-ctrl" role="tablist" aria-label={label} style={{ flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
      {layers.map((layer, index) => <button key={layer.key} id={`${idPrefix}-${index}`} role="tab"
        aria-label={accessibleLayerNames ? `Layer ${index}: ${layer.name}` : undefined}
        aria-selected={selected === index} aria-controls={panelId} tabIndex={selected === index ? 0 : -1}
        className={`seg-btn${selected === index ? ' active' : ''}`} title={layer.title ?? `Layer ${index} — ${layer.name}`}
        style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        onClick={() => { cancel(); onSelect(index) }} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % layers.length : event.key === 'ArrowLeft' ? (index + layers.length - 1) % layers.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? layers.length - 1 : null
          if (next === null) return
          event.preventDefault(); cancel(); onSelect(next); document.getElementById(`${idPrefix}-${next}`)?.focus()
        }}><span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', fontWeight: 700, opacity: selected === index ? 0.9 : 0.45, marginRight: 5 }}>{index}</span>{layer.name}</button>)}
    </div>
    {editable && (mode ? <form style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} onSubmit={event => {
      event.preventDefault()
      const name = normalizeName(value)
      if (!name) { setError('Enter a layer name.'); return }
      const message = mode === 'add' ? onAdd(name) : onRename(name)
      if (message) { setError(message); return }
      cancel()
    }}>
      <input autoFocus value={value} onChange={event => { setValue(event.target.value); setError(null) }}
        aria-label={mode === 'add' ? 'New layer name' : 'Rename layer'} aria-invalid={!!error} aria-describedby={error ? `${idPrefix}-error` : undefined}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancel() } }}
        placeholder={mode === 'add' ? 'layer_name' : 'new_name'} style={{ width: 130, height: 26, fontSize: 12, fontFamily: 'var(--font-mono)' }} />
      {error && <span id={`${idPrefix}-error`} role="alert" style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
      <button type="submit" className="btn btn-primary btn-sm">{mode === 'add' ? 'Create' : 'Rename'}</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={cancel}>Cancel</button>
    </form> : <>
      <button className="btn btn-secondary btn-sm" onClick={() => { setMode('add'); setValue(''); setError(null) }} title="Add a new empty layer">+ Layer</button>
      <button className="btn btn-ghost btn-sm" disabled={!canRename} title={canRename ? `Rename layer ${selected}` : 'Base cannot be renamed'} onClick={() => { setMode('rename'); setValue(layers[selected]?.name ?? ''); setError(null) }}>Rename</button>
      <button className="btn btn-ghost btn-sm" disabled={!canDelete} style={{ color: 'var(--danger)' }} title={canDelete ? `Delete layer ${selected} (blocked if referenced)` : 'Base cannot be deleted'} onClick={onDelete}>Delete</button>
    </>)}
  </div>
}
