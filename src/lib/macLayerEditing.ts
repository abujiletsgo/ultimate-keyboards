import type { Rule } from './karabinerGenerator'

/** UI metadata only: native profiles contain title/rules, never empty layers. */
export interface MacProfileSnapshot { rules: Rule[]; profileTitle: string; layerNames: string[] }
export const MAC_HISTORY_LIMIT = 50
export function macLayerNames(rules: readonly Rule[], metadata: readonly string[] = []): string[] {
  return [...new Set([...metadata, ...rules.flatMap(rule => 'layerName' in rule && typeof rule.layerName === 'string' ? [rule.layerName] : [])])]
}
export function cloneMacProfile(profile: MacProfileSnapshot): MacProfileSnapshot {
  return structuredClone({ rules: profile.rules, profileTitle: profile.profileTitle, layerNames: profile.layerNames })
}
export function sameMacProfile(a: MacProfileSnapshot, b: MacProfileSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
export function layerNameError(name: string, existing: readonly string[], previous?: string): string | null {
  if (!name.trim()) return 'Enter a layer name.'
  if (name !== name.trim() || !/^[\w+]+$/.test(name)) return 'Use letters, numbers, underscores, or +.'
  if (name.length > 80) return 'Use 80 characters or fewer.'
  if (name !== previous && existing.includes(name)) return `Layer "${name}" already exists.`
  return null
}
export function renameMacLayer(profile: MacProfileSnapshot, from: string | null, to: string): MacProfileSnapshot {
  if (from === null) throw new Error('Base cannot be renamed.')
  const names = macLayerNames(profile.rules, profile.layerNames)
  if (!names.includes(from)) throw new Error('This layer no longer exists.')
  const error = layerNameError(to, names, from)
  if (error) throw new Error(error)
  return { ...profile, layerNames: names.map(name => name === from ? to : name),
    rules: profile.rules.map(rule => 'layerName' in rule && rule.layerName === from ? { ...rule, layerName: to } : rule) }
}
export function macLayerActivators(rules: readonly Rule[], name: string): string[] {
  return rules.flatMap(rule => rule.type === 'layer_activator' && rule.layerName === name ? [rule.fromKey] : [])
}
export function deleteMacLayer(profile: MacProfileSnapshot, name: string | null): MacProfileSnapshot {
  if (name === null) throw new Error('Base cannot be deleted.')
  if (!macLayerNames(profile.rules, profile.layerNames).includes(name)) throw new Error('This layer no longer exists.')
  const refs = macLayerActivators(profile.rules, name)
  if (refs.length) throw new Error(`Remove or change its layer keys first: ${refs.join(', ')}.`)
  return { ...profile, layerNames: macLayerNames(profile.rules, profile.layerNames).filter(item => item !== name),
    rules: profile.rules.filter(rule => rule.type !== 'layer_binding' || rule.layerName !== name) }
}
