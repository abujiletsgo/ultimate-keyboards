/** Switch — a real checkbox styled as a toggle. Tab + Space works; label is the click target. */
import type { ReactNode } from 'react'

interface Props {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  busy?: boolean
  label?: ReactNode
  description?: ReactNode
  /** compact 32×20 variant for dense rows */
  size?: 'md' | 'sm'
  'aria-label'?: string
}

export default function Switch({ checked, onChange, disabled, busy, label, description, size = 'md', ...rest }: Props) {
  const w = size === 'sm' ? 32 : 40, h = size === 'sm' ? 20 : 22, knob = h - 6
  return (
    <label className="switch" data-disabled={disabled ? 'true' : undefined} style={{ cursor: disabled ? 'not-allowed' : busy ? 'wait' : 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || busy}
        onChange={e => onChange(e.target.checked)}
        aria-label={rest['aria-label']}
        className="switch-input"
      />
      <span aria-hidden className="switch-track" style={{ width: w, height: h, background: checked ? 'var(--accent-grad)' : 'rgba(255,255,255,0.12)' }}>
        <span className="switch-knob" style={{ width: knob, height: knob, left: checked ? w - knob - 3 : 3 }} />
      </span>
      {(label || description) && (
        <span className="switch-text">
          {label && <span className="switch-label">{label}</span>}
          {description && <span className="switch-desc">{description}</span>}
        </span>
      )}
    </label>
  )
}
