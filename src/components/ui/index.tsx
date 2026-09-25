/** Shared UI primitives. One answer per design question; see globals.css tokens. */
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { Trash2 } from 'lucide-react'

export { default as Popover } from './Popover'
export type { Anchor } from './Popover'
export { default as ConfirmBanner } from './ConfirmBanner'
export { ToastProvider, useToast, TOAST_MS } from './Toast'
export { default as Switch } from './Switch'

/** Uppercase micro label above a form control. */
export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="field-label">{children}</label>
}

/** Field = label + control stacked. */
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-head">
        <FieldLabel>{label}</FieldLabel>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** Error surface: same panel everywhere, role=alert. */
export function ErrorPanel({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="panel-inset error-panel" role="alert">
      <span style={{ flex: 1, wordBreak: 'break-word' }}>{children}</span>
      {onRetry && <button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  )
}

/** Delete control: one shape everywhere (icon + accessible name). */
export function DeleteButton({ label, onClick, ...rest }: { label: string; onClick: () => void } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button className="btn btn-danger btn-sm btn-icon" aria-label={label} title={label} onClick={onClick} {...rest}>
      <Trash2 size={13} />
    </button>
  )
}

/** Legend for behavior colors on a board. */
export const BEHAVIOR_LEGEND: { color: string; label: string }[] = [
  { color: 'rgba(96,165,250,0.65)', label: 'Layer' },
  { color: 'rgba(245,158,11,0.60)', label: 'Toggle' },
  { color: 'rgba(251,146,60,0.55)', label: 'Mod-tap' },
  { color: 'rgba(251,191,36,0.55)', label: 'Sticky' },
  { color: 'rgba(34,211,238,0.60)', label: 'BT' },
  { color: 'rgba(244,114,182,0.55)', label: 'Mouse' },
  { color: 'rgba(52,211,153,0.55)', label: 'Shifted' },
]

export function BoardLegend({ items = BEHAVIOR_LEGEND }: { items?: { color: string; label: string }[] }) {
  return (
    <div className="board-legend" aria-label="Key color legend">
      {items.map(({ color, label }) => (
        <span key={label} className="board-legend-item">
          <span className="board-legend-dot" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
          {label}
        </span>
      ))}
    </div>
  )
}
