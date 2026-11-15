/** Typing-feel settings for home-row keys, read from and written to the rules themselves (no second copy to drift). */
import { HOMEROW_HOLD_MS, HOMEROW_MISFIRE_DEFAULTS, type HomerowModRule, type Rule } from '../../lib/karabinerGenerator'

export type HoldMode = NonNullable<HomerowModRule['holdBehavior']>

export const HOLD_MODES: { id: HoldMode; label: string; help: string }[] = [
  { id: 'opposite_hand', label: 'Other hand', help: 'A hold counts early only when your other hand presses a key. Same-hand rolls stay letters.' },
  { id: 'balanced', label: 'Any key', help: 'A hold counts as soon as you press and let go of any other key while holding.' },
  { id: 'hold_preferred', label: 'Instant', help: 'A hold counts the moment you press any other key. Fastest, and the easiest to trigger by accident.' },
  { id: 'tap_preferred', label: 'Wait it out', help: 'A hold counts only after the full hold time. Slowest, and never early.' },
]

export const HOLD_MS_MIN = 100
export const HOLD_MS_MAX = 400
export const HOLD_MS_STEP = 10

export interface TypingFeel {
  /** How many home-row keys have a modifier on hold. */
  count: number
  /** The one mode every home-row key shares, or 'mixed' when they differ. */
  mode: HoldMode | 'mixed'
  /** The one hold time every home-row key shares, or 'mixed' when they differ. */
  holdMs: number | 'mixed'
}

const isHomerow = (rule: Rule): rule is HomerowModRule => rule.type === 'homerow_mod'

/** An unset field means what the engine does when it is unset. */
const modeOf = (rule: HomerowModRule): HoldMode => rule.holdBehavior ?? 'tap_preferred'
const msOf = (rule: HomerowModRule): number => rule.holdThresholdMs ?? HOMEROW_HOLD_MS

export function readTypingFeel(rules: readonly Rule[]): TypingFeel {
  const keys = rules.filter(isHomerow)
  const modes = new Set(keys.map(modeOf))
  const times = new Set(keys.map(msOf))
  return {
    count: keys.length,
    mode: modes.size === 1 ? [...modes][0] : modes.size === 0 ? HOMEROW_MISFIRE_DEFAULTS.holdBehavior : 'mixed',
    holdMs: times.size === 1 ? [...times][0] : times.size === 0 ? HOMEROW_MISFIRE_DEFAULTS.holdThresholdMs : 'mixed',
  }
}

/** Fields a new home-row rule should carry: the shared feel if there is one, else the safe defaults. */
export function feelFields(feel: TypingFeel): { holdBehavior: HoldMode; holdThresholdMs: number } {
  return {
    holdBehavior: feel.mode === 'mixed' ? HOMEROW_MISFIRE_DEFAULTS.holdBehavior : feel.mode,
    holdThresholdMs: feel.holdMs === 'mixed' ? HOMEROW_MISFIRE_DEFAULTS.holdThresholdMs : feel.holdMs,
  }
}

/** Pure edit: set the same feel on every home-row rule; other rules are untouched. */
export function applyTypingFeel(rules: readonly Rule[], patch: Partial<{ holdBehavior: HoldMode; holdThresholdMs: number }>): Rule[] {
  const ms = patch.holdThresholdMs === undefined ? undefined : Math.min(HOLD_MS_MAX, Math.max(HOLD_MS_MIN, Math.round(patch.holdThresholdMs)))
  return rules.map(rule => isHomerow(rule) ? { ...rule, ...(patch.holdBehavior ? { holdBehavior: patch.holdBehavior } : {}), ...(ms === undefined ? {} : { holdThresholdMs: ms }) } : rule)
}

export const isRecommendedFeel = (feel: TypingFeel) =>
  feel.mode === HOMEROW_MISFIRE_DEFAULTS.holdBehavior && feel.holdMs === HOMEROW_MISFIRE_DEFAULTS.holdThresholdMs

/** One plain sentence describing what the current settings do. */
export function describeTypingFeel(feel: TypingFeel): string {
  if (feel.count === 0) return 'Turn on a home-row key to tune how it feels.'
  if (feel.mode === 'mixed' || feel.holdMs === 'mixed') return 'Your keys use different settings. Pick one below to make them all match.'
  const when = {
    opposite_hand: 'a key on your other hand is pressed, or',
    balanced: 'another key is pressed and let go, or',
    hold_preferred: 'any other key is pressed, or',
    tap_preferred: '',
  }[feel.mode]
  return `A held key becomes a modifier when ${when} you hold it for ${feel.holdMs} ms. Anything quicker types the letter.`.replace('when  you', 'when you')
}
