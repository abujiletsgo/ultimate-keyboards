export const QMK_KEYCODES: string[] = [
  // Letters
  'KC_A', 'KC_B', 'KC_C', 'KC_D', 'KC_E', 'KC_F', 'KC_G', 'KC_H',
  'KC_I', 'KC_J', 'KC_K', 'KC_L', 'KC_M', 'KC_N', 'KC_O', 'KC_P',
  'KC_Q', 'KC_R', 'KC_S', 'KC_T', 'KC_U', 'KC_V', 'KC_W', 'KC_X',
  'KC_Y', 'KC_Z',
  // Numbers
  'KC_1', 'KC_2', 'KC_3', 'KC_4', 'KC_5',
  'KC_6', 'KC_7', 'KC_8', 'KC_9', 'KC_0',
  // Common keys
  'KC_ENT', 'KC_ESC', 'KC_BSPC', 'KC_TAB', 'KC_SPC',
  'KC_MINS', 'KC_EQL', 'KC_LBRC', 'KC_RBRC', 'KC_BSLS',
  'KC_SCLN', 'KC_QUOT', 'KC_GRV', 'KC_COMM', 'KC_DOT', 'KC_SLSH',
  // Modifiers
  'KC_LSFT', 'KC_RSFT', 'KC_LCTL', 'KC_RCTL',
  'KC_LALT', 'KC_RALT', 'KC_LGUI', 'KC_RGUI',
  // Navigation
  'KC_UP', 'KC_DOWN', 'KC_LEFT', 'KC_RGHT',
  'KC_HOME', 'KC_END', 'KC_PGUP', 'KC_PGDN',
  'KC_INS', 'KC_DEL', 'KC_PSCR', 'KC_CAPS',
  // Function keys
  'KC_F1', 'KC_F2', 'KC_F3', 'KC_F4', 'KC_F5', 'KC_F6',
  'KC_F7', 'KC_F8', 'KC_F9', 'KC_F10', 'KC_F11', 'KC_F12',
  // Transparent / No-op
  'KC_TRNS', 'KC_NO',
];

export interface QMKKeymapJSON {
  version: number;
  keyboard: string;
  keymap: string;
  layout: string;
  layers: string[][];
}

/**
 * Generate a QMK keymap.json object from layer arrays.
 * @param layers  Array of layers; each layer is an array of QMK keycode strings
 * @param keyboardName  The keyboard identifier (e.g. "corne")
 * @param keymapName  Optional keymap name (defaults to keyboardName + "_keymap")
 * @param layout  Optional layout name (defaults to "LAYOUT")
 */
export function generateQMKKeymap(
  layers: string[][],
  keyboardName: string,
  keymapName?: string,
  layout = 'LAYOUT',
): QMKKeymapJSON {
  return {
    version: 1,
    keyboard: keyboardName,
    keymap: keymapName ?? `${keyboardName}_keymap`,
    layout,
    layers,
  };
}

/**
 * Convert a ZMK binding string to a best-effort QMK keycode.
 * e.g. "&kp A" → "KC_A", "&trans" → "KC_TRNS", "&none" → "KC_NO"
 */
export function zmkBindingToQMK(binding: string): string {
  const trimmed = binding.trim();

  if (trimmed === '&trans') return 'KC_TRNS';
  if (trimmed === '&none') return 'KC_NO';

  const kpMatch = trimmed.match(/^&kp\s+(.+)$/);
  if (kpMatch) {
    const key = kpMatch[1].trim();
    // Map common ZMK key names to QMK keycodes
    const zmkToQmk: Record<string, string> = {
      TAB: 'KC_TAB', SPACE: 'KC_SPC', ENTER: 'KC_ENT', RETURN: 'KC_ENT',
      BACKSPACE: 'KC_BSPC', BSPC: 'KC_BSPC', ESCAPE: 'KC_ESC', ESC: 'KC_ESC',
      DELETE: 'KC_DEL', DEL: 'KC_DEL',
      LEFT_SHIFT: 'KC_LSFT', RIGHT_SHIFT: 'KC_RSFT',
      LEFT_CONTROL: 'KC_LCTL', RIGHT_CONTROL: 'KC_RCTL', LCTRL: 'KC_LCTL', RCTRL: 'KC_RCTL',
      LEFT_ALT: 'KC_LALT', RIGHT_ALT: 'KC_RALT',
      LEFT_COMMAND: 'KC_LGUI', RIGHT_COMMAND: 'KC_RGUI',
      LEFT_ARROW: 'KC_LEFT', RIGHT_ARROW: 'KC_RGHT',
      UP_ARROW: 'KC_UP', DOWN_ARROW: 'KC_DOWN',
      HOME: 'KC_HOME', END: 'KC_END', PAGE_UP: 'KC_PGUP', PAGE_DOWN: 'KC_PGDN',
      INSERT: 'KC_INS', CAPS: 'KC_CAPS', CAPSLOCK: 'KC_CAPS',
      SEMI: 'KC_SCLN', SQT: 'KC_QUOT', GRAVE: 'KC_GRV', GRV: 'KC_GRV',
      MINUS: 'KC_MINS', PLUS: 'KC_PLUS', EQUAL: 'KC_EQL', FSLH: 'KC_SLSH',
      COMMA: 'KC_COMM', DOT: 'KC_DOT', BSLH: 'KC_BSLS',
      LEFT_BRACKET: 'KC_LBRC', RIGHT_BRACKET: 'KC_RBRC',
      TILDE: 'KC_TILD', ASTERISK: 'KC_ASTR', SLASH: 'KC_SLSH',
      NUMBER_0: 'KC_0', NUMBER_1: 'KC_1', NUMBER_2: 'KC_2', NUMBER_3: 'KC_3',
      NUMBER_4: 'KC_4', NUMBER_5: 'KC_5', NUMBER_6: 'KC_6', NUMBER_7: 'KC_7',
      NUMBER_8: 'KC_8', NUMBER_9: 'KC_9',
      N0: 'KC_0', N1: 'KC_1', N2: 'KC_2', N3: 'KC_3', N4: 'KC_4',
      N5: 'KC_5', N6: 'KC_6', N7: 'KC_7', N8: 'KC_8', N9: 'KC_9',
      F1: 'KC_F1', F2: 'KC_F2', F3: 'KC_F3', F4: 'KC_F4',
      F5: 'KC_F5', F6: 'KC_F6', F7: 'KC_F7', F8: 'KC_F8',
      F9: 'KC_F9', F10: 'KC_F10', F11: 'KC_F11', F12: 'KC_F12',
    };

    if (zmkToQmk[key]) return zmkToQmk[key];

    // Single letter
    if (/^[A-Z]$/.test(key)) return `KC_${key}`;
    // Already looks like a QMK code
    if (key.startsWith('KC_')) return key;

    return `KC_${key}`;
  }

  // Layer-tap, mod-tap etc — return as comment/placeholder
  const moMatch = trimmed.match(/^&mo\s+(\d+)$/);
  if (moMatch) return `MO(${moMatch[1]})`;

  const ltMatch = trimmed.match(/^&lt\s+(\d+)\s+(.+)$/);
  if (ltMatch) return `LT(${ltMatch[1]}, KC_${ltMatch[2]})`;

  const togMatch = trimmed.match(/^&tog\s+(\d+)$/);
  if (togMatch) return `TG(${togMatch[1]})`;

  return 'KC_TRNS';
}
