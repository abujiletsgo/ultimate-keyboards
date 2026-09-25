/**
 * Toast — one app-wide status channel. Success messages auto-dismiss after
 * TOAST_MS; errors stay until dismissed. Announced via aria-live.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export const TOAST_MS = 2500

interface ToastItem { id: number; kind: 'success' | 'error' | 'info'; message: string }

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const push = useCallback((kind: ToastItem['kind'], message: string) => {
    const id = ++seq.current
    setItems(list => [...list.filter(t => t.kind !== 'success' || kind === 'error'), { id, kind, message }])
    if (kind !== 'error') setTimeout(() => setItems(list => list.filter(t => t.id !== id)), TOAST_MS)
  }, [])
  const api = useMemo<ToastApi>(() => ({
    success: m => push('success', m),
    error: m => push('error', m),
    info: m => push('info', m),
  }), [push])
  return (
    <Ctx.Provider value={api}>
      {children}
      {createPortal(
        <div className="toast-stack" aria-live="polite" aria-relevant="additions">
          {items.map(t => (
            <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`toast toast-${t.kind}`}>
              <span style={{ flex: 1 }}>{t.message}</span>
              {t.kind === 'error' && (
                <button className="btn btn-ghost btn-sm" aria-label="Dismiss" onClick={() => setItems(list => list.filter(x => x.id !== t.id))}>
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}
