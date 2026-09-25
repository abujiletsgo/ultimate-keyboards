// Karabiner-Elements JSON generator

export const KEY_CODES: string[] = [
  // Letters
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  // Digits
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  // Special keys
  'return_or_enter',
  'escape',
  'delete_or_backspace',
  'delete_forward',
  'tab',
  'spacebar',
  'caps_lock',
  // Modifiers
  'left_shift',
  'right_shift',
  'left_control',
  'right_control',
  'left_option',
  'right_option',
  'left_command',
  'right_command',
  'fn',
  // Arrow keys
  'up_arrow',
  'down_arrow',
  'left_arrow',
  'right_arrow',
  // Function keys
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6',
  'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
  // Punctuation / symbols
  'grave_accent_and_tilde',
  'hyphen',
  'equal_sign',
  'open_bracket',
  'close_bracket',
  'backslash',
  'semicolon',
  'quote',
  'comma',
  'period',
  'slash',
];

export const MODIFIER_NAMES: string[] = [
  'command',
  'option',
  'control',
  'shift',
  'fn',
];

// ── Rule types ────────────────────────────────────────────────────────────────

export interface SimpleRemapRule {
  type: 'simple';
  description: string;
  fromKey: string;
  fromModifiers?: string[];
  toKey: string;
  toModifiers?: string[];
}

export interface ComboRule {
  type: 'combo';
  description: string;
  fromKeys: string[]; // simultaneous keys
  toKey: string;
  toModifiers?: string[];
}

/**
 * Designates a key as a layer activator.
 * Hold → sets variable `layerName=1` (fires after hold threshold). Release → clears it.
 * Tap alone → optional tapKey.
 */
export interface LayerActivatorRule {
  type: 'layer_activator';
  description: string;
  fromKey: string;
  layerName: string;  // e.g. "layer1" — used as Karabiner variable name
  tapKey?: string;    // key sent on tap-only (e.g. 'spacebar' for spacebar)
}

/**
 * A key binding that only fires when a layer variable is active (=1).
 */
export interface LayerBindingRule {
  type: 'layer_binding';
  description: string;
  layerName: string;
  fromKey: string;
  toKey: string;
  toModifiers?: string[];
}

/**
 * Homerow mod: tap → the letter, hold → a modifier key.
 * Same pattern as layer_activator but outputs a modifier instead of a variable.
 */
export interface HomerowModRule {
  type: 'homerow_mod';
  description: string;
  fromKey: string;   // e.g. 'a'
  tapKey: string;    // e.g. 'a'  (what it types when tapped quickly)
  modKey: string;    // e.g. 'left_control'
}

export type Rule = SimpleRemapRule | ComboRule | LayerActivatorRule | LayerBindingRule | HomerowModRule;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildToEntry(key: string, modifiers?: string[]): Record<string, unknown> {
  const entry: Record<string, unknown> = { key_code: key };
  if (modifiers && modifiers.length > 0) {
    entry.modifiers = modifiers;
  }
  return entry;
}

// ── Core converters ───────────────────────────────────────────────────────────

export function ruleToKarabiner(rule: Rule): object {
  if (rule.type === 'simple') {
    const from: Record<string, unknown> = { key_code: rule.fromKey };
    if (rule.fromModifiers && rule.fromModifiers.length > 0) {
      from.modifiers = { mandatory: rule.fromModifiers };
    }
    return {
      description: rule.description,
      manipulators: [{ type: 'basic', from, to: [buildToEntry(rule.toKey, rule.toModifiers)] }],
    };
  }

  if (rule.type === 'combo') {
    // optional: ["any"] allows modifier passthrough (⌥+combo, ⇧+combo, etc.)
    const from: Record<string, unknown> = {
      simultaneous: rule.fromKeys.map((k) => ({ key_code: k })),
      simultaneous_options: { key_down_order: 'insensitive', key_up_order: 'insensitive' },
      modifiers: { optional: ['any'] },
    };
    return {
      description: rule.description,
      manipulators: [{ type: 'basic', from, to: [buildToEntry(rule.toKey, rule.toModifiers)] }],
    };
  }

  if (rule.type === 'layer_activator') {
    // Use to_if_held_down so fast typing (space + next char) doesn't accidentally
    // trigger the layer. Only activates after the hold threshold (~120ms).
    const manipulator: Record<string, unknown> = {
      type: 'basic',
      from: { key_code: rule.fromKey },
      to_if_held_down: [{ set_variable: { name: rule.layerName, value: 1 } }],
      to_after_key_up: [{ set_variable: { name: rule.layerName, value: 0 } }],
    };
    if (rule.tapKey) {
      manipulator.to_if_alone = [{ key_code: rule.tapKey }];
    }
    return { description: rule.description, manipulators: [manipulator] };
  }

  if (rule.type === 'layer_binding') {
    return {
      description: rule.description,
      manipulators: [{
        type: 'basic',
        conditions: [{ type: 'variable_if', name: rule.layerName, value: 1 }],
        from: { key_code: rule.fromKey, modifiers: { optional: ['any'] } },
        to: [buildToEntry(rule.toKey, rule.toModifiers)],
      }],
    };
  }

  if (rule.type === 'homerow_mod') {
    // Same tap/hold pattern as layer_activator but emits a modifier key instead of a variable.
    return {
      description: rule.description,
      manipulators: [{
        type: 'basic',
        from: { key_code: rule.fromKey },
        to_if_held_down: [{ key_code: rule.modKey }],
        to_if_alone: [{ key_code: rule.tapKey }],
        parameters: {
          'basic.to_if_held_down_threshold_milliseconds': HOMEROW_HOLD_MS,
          'basic.to_if_alone_timeout_milliseconds': HOMEROW_HOLD_MS + 30,
        },
      }],
    };
  }

  return { description: 'unknown', manipulators: [] };
}

/** Hold threshold used by homerow mods (and shown in the UI). */
export const HOMEROW_HOLD_MS = 150;

export function generateComplexModification(rules: Rule[], title: string): object {
  return {
    title,
    rules: rules.map(ruleToKarabiner),
  };
}
