/**
 * Parser and writer for QMK combo definitions in keymap.c
 *
 * Combos look like:
 *   const uint16_t PROGMEM combo_enter[] = {KC_K, KC_L, COMBO_END};
 *   [COMBO_ENTER] = COMBO(combo_enter, KC_ENT),
 */

export interface QMKCombo {
  name: string       // variable name, e.g. "combo_enter"
  enumName: string   // enum name, e.g. "COMBO_ENTER"
  fromKeys: string[] // e.g. ["KC_K", "KC_L"]
  toKey: string      // e.g. "KC_ENT"
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseQMKCombos(source: string): QMKCombo[] {
  const combos: QMKCombo[] = []

  // 1. Find all array declarations: const uint16_t PROGMEM combo_X[] = {K1, K2, COMBO_END};
  const declRe = /const\s+uint16_t\s+PROGMEM\s+(combo_\w+)\s*\[\s*\]\s*=\s*\{([^}]+)\}\s*;/g
  const decls = new Map<string, string[]>()
  let m: RegExpExecArray | null
  while ((m = declRe.exec(source)) !== null) {
    const varName = m[1]
    const keys = m[2].split(',').map(k => k.trim()).filter(k => k && k !== 'COMBO_END')
    decls.set(varName, keys)
  }

  // 2. Find combo_t array entries: [COMBO_NAME] = COMBO(combo_var, OUTPUT_KEY),
  const entryRe = /\[(\w+)\]\s*=\s*COMBO\(\s*(\w+)\s*,\s*([^)]+)\)/g
  while ((m = entryRe.exec(source)) !== null) {
    const enumName = m[1]
    const varName = m[2]
    const toKey = m[3].trim()
    const fromKeys = decls.get(varName) ?? []
    if (fromKeys.length > 0) {
      combos.push({ name: varName, enumName, fromKeys, toKey })
    }
  }

  return combos
}

// ── Writer ────────────────────────────────────────────────────────────────────

export function updateQMKCombosInSource(source: string, combos: QMKCombo[]): string {
  // Build new declarations block
  const declLines = combos.map(c =>
    `const uint16_t PROGMEM ${c.name}[] = {${c.fromKeys.join(', ')}, COMBO_END};`
  ).join('\n')

  // Build new enum block
  const enumLines = combos.map(c => `    ${c.enumName},`).join('\n')
  const enumBlock = `enum combos {\n${enumLines}\n    COMBO_LENGTH\n};\nuint16_t COMBO_LEN = COMBO_LENGTH;`

  // Build new combo_t array
  const comboEntries = combos.map(c =>
    `    [${c.enumName}]    = COMBO(${c.name}, ${c.toKey}),`
  ).join('\n')
  const comboArray = `combo_t key_combos[COMBO_LENGTH] = {\n${comboEntries}\n};`

  let result = source

  // Replace declaration block (all "const uint16_t PROGMEM combo_*" lines)
  result = result.replace(
    /(const\s+uint16_t\s+PROGMEM\s+combo_\w+\s*\[\s*\]\s*=\s*\{[^}]+\}\s*;\s*\n?)+/,
    declLines + '\n'
  )

  // Replace enum block
  result = result.replace(
    /enum combos\s*\{[\s\S]*?\};\s*uint16_t COMBO_LEN\s*=\s*COMBO_LENGTH\s*;/,
    enumBlock
  )

  // Replace combo_t array
  result = result.replace(
    /combo_t key_combos\[COMBO_LENGTH\]\s*=\s*\{[\s\S]*?\};/,
    comboArray
  )

  return result
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Given existing combos, generate a unique variable name and enum name for a new combo.
 */
export function makeComboNames(combos: QMKCombo[], toKey: string): { name: string; enumName: string } {
  const base = toKey.replace(/^KC_/, '').toLowerCase().replace(/[^a-z0-9]/g, '_')
  let suffix = ''
  let idx = 1
  while (combos.some(c => c.name === `combo_${base}${suffix}`)) {
    suffix = String(idx++)
  }
  return {
    name: `combo_${base}${suffix}`,
    enumName: `COMBO_${base.toUpperCase()}${suffix}`,
  }
}
