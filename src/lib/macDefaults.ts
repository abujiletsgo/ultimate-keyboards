import { modifierName } from './platform'
import { HOMEROW_MISFIRE_DEFAULTS, type ComboRule, type HomerowModRule, type Rule } from './karabinerGenerator'

/** Home-row positions: left hand A S D F, right hand J K L ; */
export const HOMEROW_KEYS: { key: string; label: string; hand: 'left' | 'right' }[] = [
  { key: 'a', label: 'A', hand: 'left' },
  { key: 's', label: 'S', hand: 'left' },
  { key: 'd', label: 'D', hand: 'left' },
  { key: 'f', label: 'F', hand: 'left' },
  { key: 'j', label: 'J', hand: 'right' },
  { key: 'k', label: 'K', hand: 'right' },
  { key: 'l', label: 'L', hand: 'right' },
  { key: 'semicolon', label: ';', hand: 'right' },
]


export const HOMEROW_PRESETS: { label: string; desc: string; mods: Record<string, string> }[] = [
  {
    label: 'GACS / SCAG',
    desc: 'A=⌃ S=⌥ D=⇧ F=⌘  •  J=⌘ K=⇧ L=⌥ ;=⌃',
    mods: {
      a: 'left_control', s: 'left_option', d: 'left_shift', f: 'left_command',
      j: 'right_command', k: 'right_shift', l: 'right_option', semicolon: 'right_control',
    },
  },
  {
    label: 'CAGS / SGAC',
    desc: 'A=⌘ S=⌥ D=⇧ F=⌃  •  J=⌃ K=⇧ L=⌥ ;=⌘',
    mods: {
      a: 'left_command', s: 'left_option', d: 'left_shift', f: 'left_control',
      j: 'right_control', k: 'right_shift', l: 'right_option', semicolon: 'right_command',
    },
  },
  {
    label: 'Miryoku',
    desc: 'A=⌘ S=⌥ D=⌃ F=⇧  •  J=⇧ K=⌃ L=⌥ ;=⌘',
    mods: {
      a: 'left_command', s: 'left_option', d: 'left_control', f: 'left_shift',
      j: 'right_shift', k: 'right_control', l: 'right_option', semicolon: 'right_command',
    },
  },
]

/** The home-row rules for one preset, in A S D F J K L ; order. */
export function homerowRules(preset: (typeof HOMEROW_PRESETS)[number]): HomerowModRule[] {
  return HOMEROW_KEYS.flatMap(hk => {
    const modKey = preset.mods[hk.key]
    if (!modKey) return []
    const sym = modifierName(modKey)
    return [{ type: 'homerow_mod' as const, description: `${hk.label}: hold → ${sym}, tap → ${hk.label.toLowerCase()}`, fromKey: hk.key, tapKey: hk.key, modKey, ...HOMEROW_MISFIRE_DEFAULTS }]
  })
}

/** Tom's everyday combos (2026-11-14): K+L Enter, I+O Backspace, W+E Escape. */
export const DEFAULT_COMBOS: ComboRule[] = [
  { type: 'combo', description: 'k+l → Enter', fromKeys: ['k', 'l'], toKey: 'return_or_enter' },
  { type: 'combo', description: 'i+o → Backspace', fromKeys: ['i', 'o'], toKey: 'delete_or_backspace' },
  { type: 'combo', description: 'w+e → Escape', fromKeys: ['w', 'e'], toKey: 'escape' },
]

/**
 * What a new MacBook profile starts with: home-row mods (the first preset) and the three combos.
 * Only a starting point in the editor: nothing remaps until the person chooses Apply and Enable.
 */
export const DEFAULT_RULES: Rule[] = [...homerowRules(HOMEROW_PRESETS[0]), ...DEFAULT_COMBOS]

/**
 * Caps Lock: hold = Hyper (⌃⌥⇧⌘ together, for shortcuts nothing else uses), tap = Escape.
 * The engine understands modKey "hyper" and presses Hyper the moment another key joins the hold.
 */
export const HYPER_CAPS_RULE: HomerowModRule = {
  type: 'homerow_mod', description: 'Caps Lock: hold → Hyper (⌃⌥⇧⌘), tap → Escape',
  fromKey: 'caps_lock', tapKey: 'escape', modKey: 'hyper', holdBehavior: 'hold_preferred', holdThresholdMs: 200,
}
export const hasHyperCaps = (rules: readonly Rule[]): boolean =>
  rules.some(rule => rule.type === 'homerow_mod' && rule.fromKey === HYPER_CAPS_RULE.fromKey && rule.modKey === 'hyper')
/** Turn the Caps Lock Hyper rule on or off; every other rule keeps its place. Never mutates the input. */
export function withHyperCaps(rules: readonly Rule[], on: boolean): Rule[] {
  const rest = rules.filter(rule => !(rule.type === 'homerow_mod' && rule.fromKey === HYPER_CAPS_RULE.fromKey && rule.modKey === 'hyper'))
  return on ? [...rest, { ...HYPER_CAPS_RULE }] : rest
}
/** The default profile, optionally with Caps Lock as Hyper/Escape. Off unless asked: nothing changes silently. */
export const macDefaultRules = (opts: { hyperCaps?: boolean } = {}): Rule[] =>
  withHyperCaps(structuredClone(DEFAULT_RULES), !!opts.hyperCaps)
