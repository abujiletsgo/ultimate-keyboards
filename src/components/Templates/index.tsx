import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Rule } from '@/lib/karabinerGenerator'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { nativeIsRunning, useNativeRemapping } from '@/lib/nativeRemapping'
import {
  KEY_TEMPLATES, PAGE_LEGEND, addTemplate, markTemplatesSeen, openTemplateLink, removeTemplate, templateIsLive,
  templateSections, templateStatus, type KeyTemplate,
} from '@/lib/templates'
import TemplateCard from './TemplateCard'
import TemplateSheet, { Legend, type TryState } from './TemplateSheet'
import TemplateToast, { type ToastState } from './TemplateToast'
import './templates.css'

/** Templates tab: pick a popular setup, see what it changes, add it to the working keys. Never touches live remapping. */
export default function Templates({ onTurnOn }: { onTurnOn: () => void }) {
  const rules = useKarabinerStore(s => s.rules)
  const native = useNativeRemapping()
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const seq = useRef(0)

  useEffect(() => { markTemplatesSeen() }, [])

  const sections = useMemo(() => templateSections(KEY_TEMPLATES), [])
  const statuses = useMemo(() => new Map(KEY_TEMPLATES.map(t => [t.id, templateStatus(t, rules)])), [rules])
  const open = openId ? KEY_TEMPLATES.find(t => t.id === openId) ?? null : null

  const say = useCallback((message: string, actions: ToastState['actions'] = []) => setToast({ id: ++seq.current, message, actions }), [])
  const closeToast = useCallback(() => setToast(null), [])
  const close = () => {
    setOpenId(null)
    const card = opener.current
    queueMicrotask(() => card?.focus())
  }
  const undo = () => useKarabinerStore.getState().undo()

  const add = (t: KeyTemplate) => {
    addTemplate(useKarabinerStore.getState(), t)
    close()
    say(`Added “${t.shortName}” to your keys. Not turned on yet.`, [{ label: 'Undo', run: undo }, { label: 'Turn On', run: onTurnOn }])
  }
  const remove = (t: KeyTemplate) => {
    removeTemplate(useKarabinerStore.getState(), t)
    close()
    say(`Removed “${t.shortName}” from your keys.`, [{ label: 'Undo', run: undo }])
  }
  const openLink = async (link: { url: string; startSeconds?: number }) => {
    try { await openTemplateLink(link) } catch {
      say('Couldn’t open the video. Copy the link instead.', [{ label: 'Copy Link', run: () => { void navigator.clipboard?.writeText(link.url).catch(() => {}) } }])
    }
  }
  const tryState = (t: KeyTemplate, rulesNow: Rule[]): TryState => {
    if (statuses.get(t.id)?.status !== 'in') return 'not-added'
    return templateIsLive(t, rulesNow, native.appliedProfile?.rules, nativeIsRunning(native.status)) ? 'live' : 'not-on'
  }

  return (
    <div className="tpl-scope tpl-page" data-templates-page>
      <div>
        <h2 className="tpl-title">Templates</h2>
        <p className="tpl-lede">Pick a setup that’s popular with Mac people. You’ll see what it changes before you add it.</p>
      </div>
      <Legend roles={PAGE_LEGEND.map(l => l.role)} />
      {sections.length === 0 && <div className="tpl-empty">No templates yet</div>}
      {sections.map(section => (
        <section key={section.category} className="tpl-section" aria-labelledby={`tpl-sec-${section.category}`}>
          <h3 id={`tpl-sec-${section.category}`}>{section.title}</h3>
          <ul className="tpl-grid">
            {section.items.map(t => (
              <li key={t.id}>
                <TemplateCard template={t} status={statuses.get(t.id)!} onOpen={button => { opener.current = button; setToast(null); setOpenId(t.id) }} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {open && (
        <TemplateSheet key={open.id} template={open} rules={rules} status={statuses.get(open.id)!} tryState={tryState(open, rules)}
          onClose={close} onAdd={() => add(open)} onRemove={() => remove(open)}
          onTurnOn={() => { setOpenId(null); onTurnOn() }} onOpenLink={link => { void openLink(link) }} />
      )}
      {toast && <TemplateToast toast={toast} onClose={closeToast} />}
    </div>
  )
}
