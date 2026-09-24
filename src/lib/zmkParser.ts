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

  // Match layer nodes: LayerName { ... } — anchored to the start of a line so a
  // long run of identifier characters can't make the scan quadratic (a 200 KB
  // hostile file previously took ~40 s).
  // We need to handle nested braces for the bindings block
  const layerNameRegex = /^[ \t]*(\w[\w+]*)\s*\{/gm;
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

/** Normalize a binding snippet: strip comments, collapse whitespace. */
function normalizeBinding(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .trim()
    .split(/\s+/)
    .join(' ');
}

/**
 * Tokenize a bindings-block body into per-binding spans, skipping comments.
 * Each span covers one `&behavior [params...]` run in the ORIGINAL text, so
 * edits can be spliced in place without touching formatting or comments.
 */
function tokenizeBindingSpans(body: string): Array<{ start: number; end: number; text: string }> {
  const spans: Array<{ start: number; end: number; text: string }> = [];
  let cur: { start: number; end: number } | null = null;
  const flush = () => {
    if (cur) {
      spans.push({ start: cur.start, end: cur.end, text: normalizeBinding(body.slice(cur.start, cur.end)) });
      cur = null;
    }
  };
  let i = 0;
  while (i < body.length) {
    if (body.startsWith('//', i)) {
      const nl = body.indexOf('\n', i);
      i = nl === -1 ? body.length : nl;
      continue;
    }
    if (body.startsWith('/*', i)) {
      const close = body.indexOf('*/', i + 2);
      i = close === -1 ? body.length : close + 2;
      continue;
    }
    const ch = body[i];
    if (ch === '&') {
      flush();
      cur = { start: i, end: i + 1 };
    }
    if (cur && !/\s/.test(ch)) cur.end = i + 1;
    i++;
  }
  flush();
  return spans;
}

/**
 * Write updated layer bindings back into the source with MINIMAL edits:
 * only bindings that actually changed are spliced in place, preserving the
 * file's original formatting, alignment, and comments byte-for-byte
 * everywhere else. Falls back to a full block rewrite only if the original
 * block can't be tokenized to the same key count.
 */
export function updateLayerBindingsInSource(source: string, layers: ZMKLayer[]): string {
  let result = source;

  for (const layer of layers) {
    // Search inside the keymap block only: a behaviors/macros/combos node that
    // happens to share a layer's name must never be edited in its place.
    const node = findLayerNode(result, layer.name);
    if (!node) continue;
    const openBraceIdx = node.open;
    const closeIdx = node.close;

    const bodySlice = result.slice(openBraceIdx + 1, closeIdx);
    const bindingsPattern = /(bindings\s*=\s*<)([\s\S]*?)(>\s*;)/;
    const bindMatch = bindingsPattern.exec(bodySlice);
    if (!bindMatch) continue;

    const blockBody = bindMatch[2];
    const spans = tokenizeBindingSpans(blockBody);

    let newBody: string;
    if (spans.length === layer.keys.length) {
      // Surgical path: splice only changed bindings (right-to-left)
      newBody = blockBody;
      for (let k = spans.length - 1; k >= 0; k--) {
        if (spans[k].text !== layer.keys[k]) {
          newBody = newBody.slice(0, spans[k].start) + layer.keys[k] + newBody.slice(spans[k].end);
        }
      }
    } else {
      // Structure changed unexpectedly — full rewrite fallback
      newBody = '\n            ' + layer.keys.join('\n            ') + '\n        ';
    }

    if (newBody === blockBody) continue; // untouched layer stays byte-identical

    const bodyAbsStart = openBraceIdx + 1 + bindMatch.index + bindMatch[1].length;
    const bodyAbsEnd = bodyAbsStart + blockBody.length;
    result = result.slice(0, bodyAbsStart) + newBody + result.slice(bodyAbsEnd);
  }

  return result;
}

/**
 * Insert a new all-transparent layer node at the end of the keymap block.
 * Bindings are formatted in rows of 12 to roughly mirror the board shape.
 */
export function addLayerToSource(source: string, name: string, keyCount: number): string {
  const keymapStart = source.search(/keymap\s*\{/);
  if (keymapStart === -1) return source;

  let depth = 0;
  let i = source.indexOf('{', keymapStart);
  while (i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  const closeBrace = i; // keymap block's closing '}'

  const rows: string[] = [];
  for (let k = 0; k < keyCount; k += 12) {
    rows.push(Array(Math.min(12, keyCount - k)).fill('&trans').join('  '));
  }
  const node = [
    `        ${name} {`,
    `            display-name = "${name}";`,
    `            bindings = <`,
    ...rows.map(r => `                ${r}`),
    `            >;`,
    `        };`,
  ].join('\n');

  return source.slice(0, closeBrace) + `\n${node}\n    ` + source.slice(closeBrace);
}

/** Rename a layer node (and its display-name if present). Minimal-diff. */
export function renameLayerInSource(source: string, oldName: string, newName: string): string {
  const keymapStart = source.search(/keymap\s*\{/);
  if (keymapStart === -1) return source;

  const nodeRe = new RegExp(`(\\n[ \\t]*)(${escapeRegex(oldName)})(\\s*\\{)`);
  const m = nodeRe.exec(source.slice(keymapStart));
  if (!m) return source;
  const nameStart = keymapStart + m.index + m[1].length;
  let result = source.slice(0, nameStart) + newName + source.slice(nameStart + oldName.length);

  // Update display-name inside this node if present
  const node = findLayerNode(result, newName);
  if (node) {
    const dm = /(display-name\s*=\s*")([^"]*)(")/.exec(node.body);
    if (dm) {
      const start = node.open + 1 + dm.index + dm[1].length;
      result = result.slice(0, start) + newName + result.slice(start + dm[2].length);
    }
  }
  return result;
}

/** Remove a layer node from the keymap block entirely. */
export function deleteLayerFromSource(source: string, name: string): string {
  const node = findLayerNode(source, name);
  if (!node) return source;
  // Extend to trailing `;` and leading indentation/newline
  let end = node.close + 1;
  const semi = source.slice(end).match(/^\s*;/);
  if (semi) end += semi[0].length;
  let start = node.nameStart;
  while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start--;
  if (start > 0 && source[start - 1] === '\n') start--;
  return source.slice(0, start) + source.slice(end);
}

function findLayerNode(source: string, name: string): { nameStart: number; open: number; close: number; body: string } | null {
  const keymapStart = source.search(/keymap\s*\{/);
  if (keymapStart === -1) return null;
  const re = new RegExp(`\\b${escapeRegex(name)}\\s*\\{`);
  const m = re.exec(source.slice(keymapStart));
  if (!m) return null;
  const nameStart = keymapStart + m.index;
  const open = source.indexOf('{', nameStart);
  let depth = 0;
  let i = open;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  return { nameStart, open, close: i, body: source.slice(open + 1, i) };
}

function generateComboNode(combo: ZMKCombo): string {
  const lines: string[] = [];
  lines.push(`${combo.name} {`);
  lines.push(`            bindings = <${combo.bindings}>;`);
  lines.push(`            key-positions = <${combo.keyPositions.join(' ')}>;`);
  if (combo.layers && combo.layers.length > 0) {
    lines.push(`            layers = <${combo.layers.join(' ')}>;`);
  }
  lines.push('        };');
  return lines.join('\n');
}

function combosEqual(a: ZMKCombo, b: ZMKCombo): boolean {
  return (
    a.bindings === b.bindings &&
    a.keyPositions.join(' ') === b.keyPositions.join(' ') &&
    (a.layers?.join(' ') ?? '') === (b.layers?.join(' ') ?? '')
  );
}

/**
 * Write combos back into the source with MINIMAL edits: untouched combo
 * nodes (and their comments/formatting) stay byte-identical; modified nodes
 * are regenerated in place; new nodes are appended before the block close;
 * removed nodes are deleted. Only creates a whole new block when none exists.
 */
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

  // Find the opening/closing braces of the combos block
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
  const closeBrace = i; // index of the block's closing '}'

  // Scan child nodes (NAME { ... };) inside the block, with absolute spans
  interface NodeSpan { name: string; start: number; end: number; combo: ZMKCombo | null }
  const nodes: NodeSpan[] = [];
  let p = openBrace + 1;
  while (p < closeBrace) {
    if (source.startsWith('//', p)) {
      const nl = source.indexOf('\n', p);
      p = nl === -1 || nl > closeBrace ? closeBrace : nl;
      continue;
    }
    if (source.startsWith('/*', p)) {
      const c = source.indexOf('*/', p + 2);
      p = c === -1 || c > closeBrace ? closeBrace : c + 2;
      continue;
    }
    const nodeMatch = /^(\w+)\s*\{/.exec(source.slice(p, closeBrace));
    if (nodeMatch && /\w/.test(source[p])) {
      const nameStart = p;
      const nodeOpen = source.indexOf('{', p);
      let d = 0;
      let q = nodeOpen;
      while (q < closeBrace) {
        if (source[q] === '{') d++;
        else if (source[q] === '}') {
          d--;
          if (d === 0) break;
        }
        q++;
      }
      let nodeEnd = q + 1;
      const semi = source.slice(nodeEnd).match(/^\s*;/);
      if (semi) nodeEnd += semi[0].length;
      const body = source.slice(nodeOpen + 1, q);
      nodes.push({
        name: nodeMatch[1],
        start: nameStart,
        end: nodeEnd,
        combo: body.includes('bindings') ? parseComboBlock(nodeMatch[1], body) : null,
      });
      p = nodeEnd;
      continue;
    }
    p++;
  }

  const newByName = new Map(combos.map(c => [c.name, c]));
  const oldNames = new Set(nodes.filter(n => n.combo).map(n => n.name));

  // Build splice edits (right-to-left application)
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const node of nodes) {
    if (!node.combo) continue; // property/non-combo node (e.g. compatible) — leave alone
    const replacement = newByName.get(node.name);
    if (!replacement) {
      // Deleted combo: remove the node plus its leading indentation/newline
      let s = node.start;
      while (s > 0 && (source[s - 1] === ' ' || source[s - 1] === '\t')) s--;
      if (s > 0 && source[s - 1] === '\n') s--;
      edits.push({ start: s, end: node.end, text: '' });
    } else if (!combosEqual(node.combo, replacement)) {
      edits.push({ start: node.start, end: node.end, text: generateComboNode(replacement) });
    }
  }

  // Added combos: insert before the closing brace, matching block indentation
  const added = combos.filter(c => !oldNames.has(c.name));
  if (added.length > 0) {
    const insertText = added.map(c => `\n        ${generateComboNode(c)}\n`).join('');
    edits.push({ start: closeBrace, end: closeBrace, text: insertText + '    ' });
  }

  if (edits.length === 0) return source; // nothing changed — byte-identical

  edits.sort((a, b) => b.start - a.start);
  let result = source;
  for (const e of edits) {
    result = result.slice(0, e.start) + e.text + result.slice(e.end);
  }
  return result;
}
