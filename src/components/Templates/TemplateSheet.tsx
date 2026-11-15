import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, X } from 'lucide-react'
import type { Rule } from '@/lib/karabinerGenerator'
import {
  CATEGORY_TITLE, DIFFICULTY_WORD, ROLE_WORDS, currentRoles, previewLabel, templateRoles, videoMeta,
  type KeyRole, type KeyTemplate, type TemplateStatus,
} from '@/lib/templates'
import TemplateKeyboard from './TemplateKeyboard'

export type TryState = 'not-added' | 'not-on' | 'live'

interface Props {
  template: KeyTemplate
  rules: Rule[]
  status: TemplateStatus
  tryState: TryState
  onClose: () => void
  onAdd: () => void
  onRemove: () => void
  onTurnOn: () => void
  onOpenLink: (link: { url: string; startSeconds?: number }) => void
}

const NARROW = '(max-width: 640px)'
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof matchMedia === 'function' && matchMedia(NARROW).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia(NARROW)
    const update = () => setNarrow(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return narrow
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function Legend({ roles }: { roles: KeyRole[] }) {
  return (
    <div className="tpl-legend" aria-label="Key colors">
      {roles.map(role => <span key={role} className="tpl-legend-item"><span className={`tpl-swatch tpl-swatch--${role}`} aria-hidden="true" />{ROLE_WORDS[role]}</span>)}
    </div>
  )
}

/** Detail sheet: centred card on wide windows, bottom sheet with a grabber on narrow ones. */
export default function TemplateSheet({ template, rules, status, tryState, onClose, onAdd, onRemove, onTurnOn, onOpenLink }: Props) {
  const narrow = useNarrow()
  const titleId = useId()
  const sheet = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const [view, setView] = useState<'with' | 'now'>('with')
  const [detent, setDetent] = useState<'medium' | 'large'>('medium')
  const [error, setError] = useState(false)
  const drag = useRef<number | null>(null)

  useLayoutEffect(() => { title.current?.focus() }, [])
  const marks = useMemo(() => (view === 'with' ? templateRoles(template) : currentRoles(rules, template)), [view, template, rules])
  const roles = useMemo(() => (['modtap', 'layer', 'binding', 'combo'] as KeyRole[]).filter(r => [...marks.values()].some(m => m.role === r)), [marks])

  const run = (action: () => void) => {
    try { setError(false); action() } catch { setError(true) }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab' || !sheet.current) return
    const items = [...sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === sheet.current || active === title.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
  }

  const grab = {
    onPointerDown: (event: PointerEvent) => { drag.current = event.clientY; event.currentTarget.setPointerCapture?.(event.pointerId) },
    onPointerUp: (event: PointerEvent) => {
      if (drag.current === null) return
      const dy = event.clientY - drag.current
      drag.current = null
      if (dy < -30) setDetent('large')
      else if (dy > 30) { if (detent === 'large') setDetent('medium'); else onClose() }
    },
  }

  const clash = status.status === 'clash'
  const isIn = status.status === 'in'
  const startingKeys = status.replacesOnlyStarting
  const video = template.video
  const sourceIsVideo = (() => { try { return new URL(template.source.url).hostname === new URL(video.url).hostname } catch { return false } })()

  const action = isIn ? null : clash ? 'Replace and Add' : 'Add to My Keys'

  return createPortal(
    <div className={`tpl-scope tpl-dim${narrow ? ' tpl-dim--bottom' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={sheet} className="tpl-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-detent={detent} data-template-sheet={template.id} onKeyDown={onKeyDown}>
        {narrow && <div className="tpl-grabber" aria-hidden="true" {...grab} />}
        <div className="tpl-sheet-head">
          <div>
            <div className="tpl-meta">{DIFFICULTY_WORD[template.difficulty]} · {CATEGORY_TITLE[template.category]}</div>
            <h2 id={titleId} ref={title} tabIndex={-1}>{template.name}</h2>
          </div>
          <button type="button" className="tpl-close" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="tpl-body">
          {clash && (
            <div className="tpl-notice" role="note">
              <strong>{startingKeys ? 'This swaps your starting keys' : 'This changes keys you already set up'}</strong>
              <span style={{ fontSize: 14, lineHeight: '20px' }}>
                {startingKeys
                  ? `Adding it swaps ${status.replacedCount} of the keys the app started you with. Everything else stays.`
                  : `Adding it replaces ${status.replacedCount} of your rules. Everything else stays.`}
              </span>
              <ul>{status.replaced.map((rule, i) => <li key={i}>{rule.description}</li>)}</ul>
            </div>
          )}

          <section aria-label="Preview">
            <div className="tpl-seg" role="radiogroup" aria-label="Which keys to show">
              <label><input type="radio" name={`${titleId}-view`} checked={view === 'now'} onChange={() => setView('now')} /><span>Your keys now</span></label>
              <label><input type="radio" name={`${titleId}-view`} checked={view === 'with'} onChange={() => setView('with')} /><span>With this template</span></label>
            </div>
            <TemplateKeyboard marks={marks} label={view === 'with' ? previewLabel(template) : 'Preview: your keys now, for the keys this template would change.'} />
            <div className="tpl-sheet-legend"><Legend roles={roles} /></div>
          </section>

          <section>
            <h3>Why it helps</h3>
            <p>{template.why}</p>
            <p style={{ marginTop: 6 }}><strong>Good for:</strong> {template.forWho}</p>
          </section>

          <section>
            <h3>What changes</h3>
            <ul>{template.changes.map(line => <li key={line}>{line}</li>)}</ul>
          </section>

          {template.caution && <section><h3>Good to know</h3><p>{template.caution}</p></section>}

          <section className="tpl-try">
            <h3>Try it</h3>
            <textarea aria-label="Practice typing" disabled={tryState !== 'live'} placeholder={tryState === 'live' ? 'Type here to try it' : undefined} />
            <p className="tpl-try-line">
              {tryState === 'live' && template.changes.slice(0, 2).join('. ')}
              {tryState === 'not-on' && <>Added, but not turned on yet. <button type="button" className="tpl-link" onClick={onTurnOn}>Turn On Remapping</button></>}
              {tryState === 'not-added' && <>Turns on after you add this and turn on remapping. {action && <button type="button" className="tpl-link" onClick={() => run(onAdd)}>Add to My Keys</button>}</>}
            </p>
          </section>

          <section>
            <h3>Learn more</h3>
            <div className="tpl-rows">
              <button type="button" className="tpl-row" onClick={() => onOpenLink({ url: video.url, startSeconds: video.startSeconds })}>
                <span className="tpl-row-main">
                  <span className="tpl-row-title">{video.title}</span>
                  <span className="tpl-row-sub">{videoMeta(video)}</span>
                </span>
                <ExternalLink size={16} aria-hidden="true" />
              </button>
              {video.note && <span className="tpl-note">{video.note}</span>}
              {!sourceIsVideo && (
                <button type="button" className="tpl-row" onClick={() => onOpenLink({ url: template.source.url })}>
                  <span className="tpl-row-main">
                    <span className="tpl-row-title">{template.source.title}</span>
                    <span className="tpl-row-sub">{new URL(template.source.url).hostname}</span>
                  </span>
                  <ExternalLink size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </section>

          {error && (
            <div className="tpl-error" role="alert">
              <span>Couldn’t add this. Your keys are unchanged. Try again.</span>
              <button type="button" className="tpl-btn" style={{ flex: '0 0 auto' }} onClick={() => run(isIn ? onRemove : onAdd)}>Try Again</button>
            </div>
          )}
        </div>

        <div className="tpl-foot">
          <button type="button" className="tpl-btn" onClick={onClose}>Cancel</button>
          {action
            ? <button type="button" className="tpl-btn tpl-btn--primary" onClick={() => run(onAdd)}>{action}</button>
            : <button type="button" className="tpl-btn tpl-btn--primary" disabled>Already in Your Keys</button>}
          {isIn && <span className="tpl-foot-note">Already added. <button type="button" className="tpl-link" onClick={() => run(onRemove)}>Remove from My Keys</button></span>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
