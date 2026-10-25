import type { ReactNode } from 'react'
import { Undo2, Redo2 } from 'lucide-react'

/** Local editing actions shared by file-backed and native keymaps. */
interface Props {
  label: ReactNode
  dirty: boolean
  editable?: boolean
  canUndo: boolean
  canRedo: boolean
  onSave: () => void
  onRevert: () => void
  onUndo: () => void
  onRedo: () => void
  afterSave?: ReactNode
  extraActions?: ReactNode
  revertTitle?: string
}
export default function KeymapActionBar({ label, dirty, editable = true, canUndo, canRedo, onSave, onRevert, onUndo, onRedo, afterSave, extraActions, revertTitle = 'Discard unsaved edits and restore the saved profile' }: Props) {
  return <div aria-label="Keymap editing actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
    {label}
    {dirty && <span className="tag" style={{ color: 'var(--warning)', background: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.25)' }}>Unsaved</span>}
    {!editable && <span className="tag" title="See the compatibility notes below">Read-only</span>}
    <button className="btn btn-primary btn-sm" onClick={onSave} disabled={!dirty || !editable}>Save</button>
    {afterSave}
    <span style={{ flex: 1 }} />
    {extraActions}
    <button className="btn btn-ghost btn-sm btn-icon" aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo || !editable} onClick={onUndo}><Undo2 size={13} /></button>
    <button className="btn btn-ghost btn-sm btn-icon" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canRedo || !editable} onClick={onRedo}><Redo2 size={13} /></button>
    {dirty && <button className="btn btn-ghost btn-sm" disabled={!editable} title={revertTitle} onClick={onRevert}>Revert</button>}
  </div>
}
