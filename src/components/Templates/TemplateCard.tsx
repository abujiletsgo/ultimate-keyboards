import { Check } from 'lucide-react'
import { DIFFICULTY_WORD, cardTag, templateRoles, type KeyTemplate, type TemplateStatus } from '@/lib/templates'
import TemplateKeyboard from './TemplateKeyboard'

interface Props { template: KeyTemplate; status: TemplateStatus; onOpen: (button: HTMLButtonElement) => void }

export default function TemplateCard({ template, status, onOpen }: Props) {
  const tag = cardTag(status)
  const name = [template.shortName, template.blurb, DIFFICULTY_WORD[template.difficulty], tag ? `${tag.text}.` : ''].filter(Boolean).join('. ').replace(/\.\./g, '.')
  return (
    <button type="button" className="tpl-card" aria-label={name} data-template={template.id} onClick={event => onOpen(event.currentTarget)}>
      <TemplateKeyboard marks={templateRoles(template)} />
      <span className="tpl-card-title" aria-hidden="true">{template.shortName}</span>
      <span className="tpl-card-line" aria-hidden="true">{template.blurb}</span>
      <span className="tpl-card-foot" aria-hidden="true">
        <span>{DIFFICULTY_WORD[template.difficulty]}</span>
        {tag && <span className={`tpl-tag tpl-tag--${tag.kind}`}>{tag.kind === 'in' && <Check size={12} />}{tag.text}</span>}
      </span>
    </button>
  )
}
