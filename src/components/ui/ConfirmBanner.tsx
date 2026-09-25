/**
 * ConfirmBanner — the in-app replacement for window.confirm. Inline, keyboard
 * reachable, Esc cancels, the confirming button is focused first.
 */
import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Optional extra actions rendered between confirm and cancel (e.g. "Save, then switch"). */
  extra?: ReactNode
}

export default function ConfirmBanner({ message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, onConfirm, onCancel, extra }: Props) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => { first.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel])
  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="glass anim-fade-up confirm-banner"
      data-danger={danger ? 'true' : undefined}
    >
      <span style={{ flex: 1, minWidth: 200 }}>{message}</span>
      <button ref={first} className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
      {extra}
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>{cancelLabel}</button>
    </div>
  )
}
