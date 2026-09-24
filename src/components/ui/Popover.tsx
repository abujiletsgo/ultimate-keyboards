/**
 * Popover — the one anchored floating surface in the app.
 *
 * Portaled into <body> (ancestors keep transforms from their entry
 * animations, which would otherwise capture position:fixed), placed from its
 * measured size and clamped to the viewport, with dialog semantics: initial
 * focus, focus trap, Esc to close, focus returned to the opener on close.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface Anchor {
  /** left edge of the anchor element (viewport px) */
  x: number
  /** preferred top edge for the popover (usually anchor bottom + gap) */
  y: number
  /** anchor top edge, used when the popover must flip above */
  top?: number
}

interface Props {
  anchor: Anchor
  width?: number
  onClose: () => void
  /** Accessible name for the dialog */
  label: string
  children: ReactNode
  /** z-index layer; nested popovers (dropdowns inside a popover) use 'menu' */
  layer?: 'popover' | 'menu'
  /** Do not draw the click-away backdrop (nested menus rely on outside-mousedown instead) */
  noBackdrop?: boolean
  /** Extra class on the surface (defaults to the glass popover surface) */
  className?: string
  /** Called on outside mousedown when there is no backdrop */
  onOutsideMouseDown?: (target: Node) => void
}

const MARGIN = 8

export default function Popover({ anchor, width = 300, onClose, label, children, layer = 'popover', noBackdrop, className, onOutsideMouseDown }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const openerRef = useRef<Element | null>(null)

  // Remember the opener and restore focus on close.
  useEffect(() => {
    openerRef.current = document.activeElement
    return () => {
      const el = openerRef.current as HTMLElement | null
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus()
    }
  }, [])

  // Initial focus: first focusable control inside.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const first = el.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')
    ;(first ?? el).focus({ preventScroll: true })
  }, [])

  // Esc closes; Tab cycles inside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab' || !ref.current) return
      const focusables = Array.from(ref.current.querySelectorAll<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])'))
        .filter(f => !f.hasAttribute('disabled'))
      if (focusables.length === 0) return
      const first = focusables[0], last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Outside mousedown (for backdrop-less menus).
  useEffect(() => {
    if (!noBackdrop) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutsideMouseDown?.(e.target as Node)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [noBackdrop, onOutsideMouseDown])

  // Measured placement, re-run when content resizes.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const place = () => {
      const vw = window.innerWidth, vh = window.innerHeight
      const w = el.offsetWidth || width
      const h = el.offsetHeight
      let left = anchor.x
      if (left + w > vw - MARGIN) left = vw - w - MARGIN
      if (left < MARGIN) left = MARGIN
      let top = anchor.y
      if (top + h > vh - MARGIN) {
        const above = (anchor.top ?? anchor.y - 44) - h
        top = above >= MARGIN ? above : vh - MARGIN - h
      }
      if (top < MARGIN) top = MARGIN
      setPos(prev => (prev && prev.left === left && prev.top === top) ? prev : { left, top })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    window.addEventListener('resize', place)
    return () => { ro.disconnect(); window.removeEventListener('resize', place) }
  }, [anchor.x, anchor.y, anchor.top, width])

  return createPortal(
    <>
      {!noBackdrop && <div className="popover-backdrop" style={{ zIndex: layer === 'menu' ? 'var(--z-menu)' : 'var(--z-popover)' } as React.CSSProperties} onMouseDown={onClose} />}
      <div
        ref={ref}
        role="dialog"
        aria-modal={!noBackdrop}
        aria-label={label}
        tabIndex={-1}
        className={`popover-surface ${className ?? 'glass-strong anim-scale-in'}`}
        style={{
          position: 'fixed', width,
          left: pos?.left ?? 0, top: pos?.top ?? 0,
          visibility: pos ? 'visible' : 'hidden',
          zIndex: layer === 'menu' ? 'var(--z-menu)' : 'var(--z-popover)',
          maxHeight: `calc(100vh - ${MARGIN * 2}px)`, overflowY: 'auto', outline: 'none',
        } as React.CSSProperties}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}
