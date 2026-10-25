import type { ReactNode } from 'react'
import { Popover } from '@/components/ui'
import type { Anchor } from '@/components/ui/Popover'

export interface BindingBehavior { code: string; label: string; title?: string; color: string }
/** One binding interaction for every keyboard: choose a behavior, edit parameters, Apply. */
export default function BindingEditorShell({ anchor, label, behaviors, selected, onSelect, onCancel, onApply, preview, children, disabled = false }:
  { anchor: Anchor; label: string; behaviors: readonly BindingBehavior[]; selected: string; onSelect(code: string): void;
    onCancel(): void; onApply(): void; preview: string; children: ReactNode; disabled?: boolean }) {
  return <Popover anchor={anchor} width={300} label={label} onClose={onCancel}>
    <div className="binding-editor" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Binding Type</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {behaviors.map(b => { const active = b.code === selected; return <button key={b.code} type="button" onClick={() => onSelect(b.code)}
            title={b.title ?? b.label} aria-pressed={active} className="pill" style={{ padding: '3px 9px', borderRadius: 20, cursor: 'pointer', fontSize: 10,
              fontWeight: active ? 700 : 500, background: active ? b.color : 'rgba(255,255,255,0.05)',
              border: active ? `1px solid ${b.color.replace(/[\d.]+\)$/, '0.6)')}` : '1px solid var(--glass-border)',
              color: active ? '#fff' : 'var(--text-muted)',
              transition: 'background var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out)' }}>{b.label}</button> })}
        </div>
      </div>
      <div style={{ padding: '12px 12px 10px' }}>{children}</div>
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.02)' }}>
        <code className="mono" title={preview} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</code>
        <button type="button" onClick={onApply} disabled={disabled} className="btn btn-primary btn-sm">Apply</button>
      </div>
    </div>
  </Popover>
}
