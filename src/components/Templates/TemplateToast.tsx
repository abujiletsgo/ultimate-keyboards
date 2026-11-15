import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface ToastAction { label: string; run: () => void }
export interface ToastState { id: number; message: string; actions: ToastAction[] }
export const TEMPLATE_TOAST_MS = 6000

/** Polite status with actions (Undo, Turn On); closes itself after six seconds. */
export default function TemplateToast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, TEMPLATE_TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast.id, onClose])
  return createPortal(
    <div className="tpl-scope tpl-toast" role="status" aria-live="polite" data-toast>
      <span>{toast.message}</span>
      {toast.actions.map(action => (
        <button key={action.label} type="button" className="tpl-link" onClick={() => { action.run(); onClose() }}>{action.label}</button>
      ))}
    </div>,
    document.body,
  )
}
