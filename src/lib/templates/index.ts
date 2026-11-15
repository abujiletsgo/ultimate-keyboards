import type { Rule } from '../karabinerGenerator'
import { createNativeProfile, type NativeProfile } from '../nativeRemapping'
import raw from './catalog.json'

export type TemplateCategory = 'caps' | 'home-row' | 'layers' | 'combos'
export type TemplateDifficulty = 'easy' | 'medium' | 'tricky'

/** A video is only listed after its page was opened and these fields recorded. */
export interface TemplateVideo {
  url: string
  videoId: string
  title: string
  channel: string
  /** YYYY-MM-DD upload date. */
  published: string
  checkedAt: string
  checkedHow: string
  startSeconds?: number
  /** Plain words on what the video does and does not show. */
  note: string
}

export interface KeyTemplate {
  id: string
  /** Full name, used as the sheet title. */
  name: string
  /** Card title, at most SHORT_NAME_MAX characters. */
  shortName: string
  /** One-line card description, at most BLURB_MAX characters. */
  blurb: string
  category: TemplateCategory
  difficulty: TemplateDifficulty
  /** Plain "why it helps", written for a 12-year-old. */
  why: string
  forWho: string
  /** One line per visible change. */
  changes: string[]
  caution?: string
  rules: Rule[]
  video: TemplateVideo
  source: { title: string; url: string; note: string }
}

export const SHORT_NAME_MAX = 32
export const BLURB_MAX = 80

export interface LeftOut { name: string; reason: string }

export const TEMPLATE_CATALOG = raw as unknown as { schema: 1; checkedAt: string; templates: KeyTemplate[]; leftOut: LeftOut[] }
export const KEY_TEMPLATES: readonly KeyTemplate[] = TEMPLATE_CATALOG.templates

export function templateById(id: string): KeyTemplate | undefined {
  return KEY_TEMPLATES.find(t => t.id === id)
}

/** Fresh copy of a template's rules, safe to put in the working profile. */
export function templateRules(template: KeyTemplate): Rule[] {
  return structuredClone(template.rules)
}

export function templateProfile(template: KeyTemplate): NativeProfile {
  return createNativeProfile(template.name, template.rules)
}

/** Physical keys a template takes over, so the UI can warn when two templates collide. */
export function templateKeys(template: KeyTemplate): string[] {
  const keys = new Set<string>()
  for (const rule of template.rules) {
    if (rule.type === 'combo') rule.fromKeys.forEach(k => keys.add(k))
    else if (rule.type !== 'layer_binding') keys.add(rule.fromKey)
  }
  return [...keys]
}

export * from './status'
export * from './roles'
export * from './firstRun'
export * from './video'
export * from './openVideo'
