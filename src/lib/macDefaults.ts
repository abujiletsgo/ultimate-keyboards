import type { ComboRule, HomerowModRule, Rule } from './karabinerGenerator'

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

const MOD_SYM: Record<string, string> = { control: '⌃', option: '⌥', shift: '⇧', command: '⌘' }

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
    const sym = MOD_SYM[modKey.replace(/^(left|right)_/, '')] ?? modKey
    return [{ type: 'homerow_mod' as const, description: `${hk.label}: hold → ${sym}, tap → ${hk.label.toLowerCase()}`, fromKey: hk.key, tapKey: hk.key, modKey }]
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
