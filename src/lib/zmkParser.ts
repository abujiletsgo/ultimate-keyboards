export interface ZMKCombo {
  name: string;
  bindings: string;
  keyPositions: number[];
  layers?: number[];
}

export interface ZMKLayer {
  index: number;
  name: string;
  displayName?: string;
  keys: string[];
}

export interface ZMKKeymap {
  layers: ZMKLayer[];
  combos: ZMKCombo[];
  rawSource: string;
}

/**
 * Parse a single combo node block (everything between name { ... })
 */
function parseComboBlock(name: string, body: string): ZMKCombo {
  // bindings = <&kp ENTER>; or <&mo 3>;
  const bindingsMatch = body.match(/bindings\s*=\s*<([^>]+)>/);
  const bindings = bindingsMatch ? bindingsMatch[1].trim() : '';

  // key-positions = <21 20>;
  const posMatch = body.match(/key-positions\s*=\s*<([^>]+)>/);
  const keyPositions = posMatch
    ? posMatch[1].trim().split(/\s+/).map(Number)
    : [];

  // layers = <3>; (optional)
  const layersMatch = body.match(/layers\s*=\s*<([^>]+)>/);
  const layers = layersMatch
    ? layersMatch[1].trim().split(/\s+/).map(Number)
    : undefined;

  return { name, bindings, keyPositions, layers };
}

/**
 * Extract the raw combos block text from the source
 */
function extractCombosBlock(source: string): string | null {
  const startIdx = source.search(/combos\s*\{/);
  if (startIdx === -1) return null;

  let depth = 0;
  let i = source.indexOf('{', startIdx);
  const blockStart = i;

  while (i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(blockStart, i + 1);
      }
    }
    i++;
  }
  return null;
}

/**
 * Parse combos from the combos { ... } block text
 */
function parseCombos(source: string): ZMKCombo[] {
  const block = extractCombosBlock(source);
  if (!block) return [];

  // Remove the outer combos { compatible = ...; ... } wrapper
  // Find all named nodes: NAME { ... }
  const combos: ZMKCombo[] = [];

  // Skip the first { of the combos block itself
  const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));

  // Match named child nodes
  const nodeRegex = /(\w+)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = nodeRegex.exec(inner)) !== null) {
    const nodeName = match[1];
    const nodeBody = match[2];

    // Skip the compatible line (it's a property, not a named node — but our regex handles it fine)
    if (nodeName === 'compatible') continue;

    // Check if it looks like a combo (has bindings property)
    if (nodeBody.includes('bindings')) {
      combos.push(parseComboBlock(nodeName, nodeBody));
    }
  }

  return combos;
}

/**
 * Parse layer bindings from a layer block body text
 */
function parseLayerKeys(bindingsText: string): string[] {
  // Extract content between < and > in the bindings = <...>; block
  // There may be whitespace/newlines
  const match = bindingsText.match(/bindings\s*=\s*<([\s\S]*?)>\s*;/);
  if (!match) return [];

  // Strip comments that may appear inside the bindings block
  const raw = match[1]
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .trim();

  // Devicetree phandle-array semantics: every binding starts with an
  // `&behavior` token, and every following token up to the next `&` is a
  // parameter of that binding. This is robust for ANY behavior — `&bt BT_SEL 0`
  // (2 params), zero-arg behaviors (&trans, &none, &soft_off, &caps_word),
  // and custom user behaviors — with no per-behavior argument table.
  const tokens = raw.split(/\s+/).filter(Boolean);
  const keys: string[] = [];
  let current: string[] | null = null;

  for (const t of tokens) {
    if (t.startsWith('&')) {
      if (current) keys.push(current.join(' '));
      current = [t];
    } else if (current) {
      current.push(t);
    } else {
      // Bare token before any & (malformed source) — keep it visible
      keys.push(t);
    }
  }
  if (current) keys.push(current.join(' '));

  return keys;
}

/**
 * Parse all layers from the keymap { ... } block
 */
function parseLayers(source: string): ZMKLayer[] {
  // Find keymap { ... } block
  const keymapStart = source.search(/keymap\s*\{/);
  if (keymapStart === -1) return [];

  let depth = 0;
  let i = source.indexOf('{', keymapStart);
  let blockStart = i;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  const keymapBlock = source.slice(blockStart + 1, i);

  const layers: ZMKLayer[] = [];
  let layerIndex = 0;

  // Match layer nodes: LayerName { ... }
  // We need to handle nested braces for the bindings block
  const layerNameRegex = /(\w[\w+]*)\s*\{/g;
  let lm: RegExpExecArray | null;

  while ((lm = layerNameRegex.exec(keymapBlock)) !== null) {
    const layerName = lm[1];
    if (layerName === 'compatible') continue;

    // Extract the full body of this layer node
    let d = 0;
    let j = lm.index + lm[0].length - 1; // position of '{'
    const bodyStart = j;
    while (j < keymapBlock.length) {
      if (keymapBlock[j] === '{') d++;
      else if (keymapBlock[j] === '}') {
        d--;
        if (d === 0) break;
      }
      j++;
    }
    const layerBody = keymapBlock.slice(bodyStart + 1, j);

    // Extract display-name if present
    const displayMatch = layerBody.match(/display-name\s*=\s*"([^"]+)"/);
    const displayName = displayMatch ? displayMatch[1] : undefined;

    // Extract keys
    const keys = parseLayerKeys(layerBody);

    if (keys.length > 0) {
      layers.push({
        index: layerIndex,
        name: layerName,
        displayName,
        keys,
      });
      layerIndex++;
    }
  }

  return layers;
}

export function parseKeymapText(text: string): ZMKKeymap {
  const combos = parseCombos(text);
  const layers = parseLayers(text);
  return { layers, combos, rawSource: text };
}

export function generateCombosBlock(combos: ZMKCombo[]): string {
  const lines: string[] = [];
  lines.push('    combos {');
  lines.push('        compatible = "zmk,combos";');
  lines.push('');

  for (const combo of combos) {
    lines.push(`        ${combo.name} {`);
    lines.push(`            bindings = <${combo.bindings}>;`);
    lines.push(`            key-positions = <${combo.keyPositions.join(' ')}>;`);
    if (combo.layers && combo.layers.length > 0) {
      lines.push(`            layers = <${combo.layers.join(' ')}>;`);
    }
    lines.push('        };');
    lines.push('');
  }

  lines.push('    };');
  return lines.join('\n');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Write updated layer bindings back into the source, replacing each layer's
 * bindings = <...>; block with the current keys from the store.
 */
export function updateLayerBindingsInSource(source: string, layers: ZMKLayer[]): string {
  let result = source;

  for (const layer of layers) {
    const layerNamePattern = new RegExp(`\\b${escapeRegex(layer.name)}\\s*\\{`);
    const layerMatch = layerNamePattern.exec(result);
    if (!layerMatch) continue;

    // Walk braces to find the layer body
    const openBraceIdx = result.indexOf('{', layerMatch.index);
    let depth = 0;
    let closeIdx = openBraceIdx;
    while (closeIdx < result.length) {
      if (result[closeIdx] === '{') depth++;
      else if (result[closeIdx] === '}') {
        depth--;
        if (depth === 0) break;
      }
      closeIdx++;
    }

    const bodySlice = result.slice(openBraceIdx + 1, closeIdx);
    const bindingsPattern = /bindings\s*=\s*<[\s\S]*?>\s*;/;
    const bindMatch = bindingsPattern.exec(bodySlice);
    if (!bindMatch) continue;

    const newBindings = layer.keys.join('\n            ');
    const replacement = `bindings = <\n            ${newBindings}\n        >;`;

    const bindAbsStart = openBraceIdx + 1 + bindMatch.index;
    const bindAbsEnd = bindAbsStart + bindMatch[0].length;

    result = result.slice(0, bindAbsStart) + replacement + result.slice(bindAbsEnd);
  }

  return result;
}

export function updateCombosInSource(source: string, combos: ZMKCombo[]): string {
  // Find the start of the combos block
  const startMatch = source.search(/\s*combos\s*\{/);
  if (startMatch === -1) {
    // No combos block exists — insert before keymap {
    const keymapIdx = source.search(/\s*keymap\s*\{/);
    if (keymapIdx === -1) return source;
    const newBlock = generateCombosBlock(combos) + '\n\n';
    return source.slice(0, keymapIdx) + newBlock + source.slice(keymapIdx);
  }

  // Find the actual opening brace of the combos block
  const openBrace = source.indexOf('{', startMatch);
  let depth = 0;
  let i = openBrace;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }

  // Consume the node's trailing semicolon (`};`) so regeneration doesn't
  // accumulate an extra `;` on every save — generateCombosBlock emits `};`.
  let end = i + 1;
  const semiMatch = source.slice(end).match(/^\s*;/);
  if (semiMatch) end += semiMatch[0].length;

  // Replace from combos { ... }; (including leading whitespace)
  const beforeBlock = source.slice(0, startMatch);
  const afterBlock = source.slice(end);
  const newBlock = '\n' + generateCombosBlock(combos);

  return beforeBlock + newBlock + afterBlock;
}
