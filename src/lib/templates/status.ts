import type { Rule } from '../karabinerGenerator'
import { DEFAULT_RULES } from '../macDefaults'
import type { KeyTemplate, TemplateCategory, TemplateDifficulty } from './index'

/** The eight home-row keys. A home-row template owns all of them. */
export const HOME_ROW_KEYS: readonly string[] = ['a', 's', 'd', 'f', 'j', 'k', 'l', 'semicolon']

/** Two rules are the same when every field except `description` is equal; combo keys compare as a set. */
export function ruleIdentity(rule: Rule): string {
  const { description: _description, ...rest } = rule as Rule & Record<string, unknown>
  const body: Record<string, unknown> = { ...rest }
  if (rule.type === 'combo') body.fromKeys = [...rule.fromKeys].sort()
  const sorted = Object.keys(body).sort().filter(k => body[k] !== undefined)
  return JSON.stringify(sorted.map(k => [k, body[k]]))
}
export const sameRule = (a: Rule, b: Rule): boolean => ruleIdentity(a) === ruleIdentity(b)

/** What a rule takes over; two different rules in one slot cannot both work. `null` = none (plain remaps). */
export function ruleSlot(rule: Rule): string | null {
  if (rule.type === 'homerow_mod' || rule.type === 'layer_activator') return `hold:${rule.fromKey}`
  if (rule.type === 'combo') return `combo:${[...rule.fromKeys].sort().join('+')}`
  if (rule.type === 'layer_binding') return `bind:${rule.layerName}:${rule.fromKey}`
  return null
}

const ruleLayer = (rule: Rule): string | null =>
  rule.type === 'layer_activator' || rule.type === 'layer_binding' ? rule.layerName : null

export type TemplateState = 'in' | 'clash' | 'free'

export interface TemplateStatus {
  status: TemplateState
  /** Existing rules that are the same as a template rule; they stay where they are. */
  kept: Rule[]
  /** Existing rules that adding would replace. */
  replaced: Rule[]
  /** Template rules not in the profile yet, in catalog order. */
  added: Rule[]
  replacedCount: number
  /** True when every replaced rule is one the app started the person with. */
  replacesOnlyStarting: boolean
}

const STARTING = new Set(DEFAULT_RULES.map(ruleIdentity))

/** Which of `rules` (by index) the template would replace, and which template rules are missing. */
function plan(template: KeyTemplate, rules: readonly Rule[]) {
  const own = new Set(template.rules.map(ruleIdentity))
  const slots = new Set(template.rules.map(ruleSlot).filter((s): s is string => s !== null))
  const layers = new Set(template.rules.map(ruleLayer).filter((l): l is string => l !== null))
  const family = template.category === 'home-row'
  const kept: number[] = []
  const replaced: number[] = []
  rules.forEach((rule, index) => {
    if (own.has(ruleIdentity(rule))) { kept.push(index); return }
    const slot = ruleSlot(rule)
    const layer = ruleLayer(rule)
    if ((slot !== null && slots.has(slot)) || (layer !== null && layers.has(layer))
      || (family && rule.type === 'homerow_mod' && HOME_ROW_KEYS.includes(rule.fromKey))) replaced.push(index)
  })
  const present = new Set(rules.map(ruleIdentity))
  const added = template.rules.filter(rule => !present.has(ruleIdentity(rule)))
  return { kept, replaced, added }
}

/** Pure: how a template relates to the working profile. Nothing is written. */
export function templateStatus(template: KeyTemplate, rules: readonly Rule[]): TemplateStatus {
  const p = plan(template, rules)
  const replaced = p.replaced.map(i => rules[i])
  const status: TemplateState = replaced.length > 0 ? 'clash' : p.added.length === 0 ? 'in' : 'free'
  return {
    status,
    kept: p.kept.map(i => rules[i]),
    replaced,
    added: p.added,
    replacedCount: replaced.length,
    replacesOnlyStarting: replaced.length > 0 && replaced.every(rule => STARTING.has(ruleIdentity(rule))),
  }
}

/** Add or Replace and Add: replaced rules out, missing rules in, everything else untouched. */
export function addTemplateRules(template: KeyTemplate, rules: readonly Rule[]): Rule[] {
  const p = plan(template, rules)
  const out = new Set(p.replaced)
  return [...rules.filter((_, i) => !out.has(i)), ...structuredClone(p.added)]
}

/** Remove from My Keys: takes out exactly the template's own rules. */
export function removeTemplateRules(template: KeyTemplate, rules: readonly Rule[]): Rule[] {
  const own = new Set(template.rules.map(ruleIdentity))
  return rules.filter(rule => !own.has(ruleIdentity(rule)))
}

/** The minimum the store has to offer: one `replaceRules` call is one undo step. */
export interface TemplateStore { rules: Rule[]; replaceRules: (rules: Rule[]) => void }

export function addTemplate(store: TemplateStore, template: KeyTemplate): void {
  store.replaceRules(addTemplateRules(template, store.rules))
}
export function removeTemplate(store: TemplateStore, template: KeyTemplate): void {
  store.replaceRules(removeTemplateRules(template, store.rules))
}

/** Try it works only when the rules are in the working profile and in what remapping last applied. */
export function templateIsLive(template: KeyTemplate, rules: readonly Rule[], applied: readonly Rule[] | null | undefined, running: boolean): boolean {
  return running && !!applied && templateStatus(template, rules).status === 'in' && templateStatus(template, applied).status === 'in'
}

export const DIFFICULTY_WORD: Record<TemplateDifficulty, string> = { easy: 'Easy', medium: 'Takes practice', tricky: 'Tricky' }
export const CATEGORY_TITLE: Record<TemplateCategory, string> = {
  caps: 'Caps Lock', 'home-row': 'Home row keys', layers: 'Hold a key, get new keys', combos: 'Press two keys together',
}
const SECTION_ORDER: TemplateCategory[] = ['caps', 'home-row', 'layers', 'combos']
const DIFFICULTY_ORDER: TemplateDifficulty[] = ['easy', 'medium', 'tricky']

/** Gallery sections in the designed order; easy first, ties keep catalog order; empty sections are not drawn. */
export function templateSections(templates: readonly KeyTemplate[]): { category: TemplateCategory; title: string; items: KeyTemplate[] }[] {
  return SECTION_ORDER.map(category => ({
    category, title: CATEGORY_TITLE[category],
    items: templates.filter(t => t.category === category)
      .map((t, i) => ({ t, i })).sort((a, b) => DIFFICULTY_ORDER.indexOf(a.t.difficulty) - DIFFICULTY_ORDER.indexOf(b.t.difficulty) || a.i - b.i).map(x => x.t),
  })).filter(section => section.items.length > 0)
}

/** The tag a card shows, or null. */
export function cardTag(s: TemplateStatus): { kind: 'in' | 'replaces' | 'swaps'; text: string } | null {
  if (s.status === 'in') return { kind: 'in', text: 'In your keys' }
  if (s.status === 'clash') return s.replacesOnlyStarting
    ? { kind: 'swaps', text: `Swaps ${s.replacedCount} starting keys` }
    : { kind: 'replaces', text: `Replaces ${s.replacedCount} of your rules` }
  return null
}
