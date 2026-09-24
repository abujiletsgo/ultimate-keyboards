/**
 * Devicetree parser runtime: web-tree-sitter + the tree-sitter-devicetree
 * grammar (both WASM). Initialised once, asynchronously; parsing is then
 * synchronous, which keeps the stores' edit actions simple.
 *
 * The app initialises it with Vite `?url` asset imports (see App.tsx); tests
 * initialise it with file paths (tests/setup.ts).
 */
import * as TS from 'web-tree-sitter'

// web-tree-sitter 0.25+ exports { Parser, Language }; older builds default-export Parser.
const ParserCtor: any = (TS as any).Parser ?? (TS as any).default
const LanguageCtor: any = (TS as any).Language ?? ParserCtor?.Language

export type SyntaxNode = any
export type Tree = any

let parser: any = null
let initPromise: Promise<void> | null = null

export interface DtInit {
  /** URL or file path of web-tree-sitter.wasm */
  runtime: string
  /** URL or file path of tree-sitter-devicetree.wasm */
  grammar: string
}

const isUrlLike = (s: string) => /^(https?:|tauri:|asset:|blob:|\/)/.test(s)

export function initDevicetree(opts: DtInit): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
      if (inBrowser && isUrlLike(opts.runtime) && isUrlLike(opts.grammar)) {
        // Browser / Tauri: fetch the bytes ourselves. Emscripten's own loader
        // fails on Tauri's custom-scheme origin ("both async and sync fetching
        // of the wasm failed"), and this also sidesteps MIME-type issues with
        // instantiateStreaming.
        const [runtimeBytes, grammarBytes] = await Promise.all([
          fetch(opts.runtime).then(r => { if (!r.ok) throw new Error(`fetch ${opts.runtime}: ${r.status}`); return r.arrayBuffer() }),
          fetch(opts.grammar).then(r => { if (!r.ok) throw new Error(`fetch ${opts.grammar}: ${r.status}`); return r.arrayBuffer() }),
        ])
        await ParserCtor.init({ wasmBinary: runtimeBytes })
        const lang = await LanguageCtor.load(new Uint8Array(grammarBytes))
        const p = new ParserCtor()
        p.setLanguage(lang)
        parser = p
        return
      }
      // Node / bun: file paths.
      await ParserCtor.init({ locateFile: () => opts.runtime })
      const lang = await LanguageCtor.load(opts.grammar)
      const p = new ParserCtor()
      p.setLanguage(lang)
      parser = p
    })()
  }
  return initPromise
}

export function isDevicetreeReady(): boolean {
  return parser !== null
}

/** Parse a devicetree source. Throws if `initDevicetree` has not completed. */
export function parseDevicetree(source: string): Tree {
  if (!parser) throw new Error('Devicetree parser not initialised — call initDevicetree() first')
  return parser.parse(source)
}

/** Named children only, in order. */
export function namedChildren(n: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = []
  for (let i = 0; i < n.namedChildCount; i++) out.push(n.namedChild(i))
  return out
}

/** 1-based lines of every ERROR / missing node in the tree. */
export function syntaxErrorLines(tree: Tree): number[] {
  const lines: number[] = []
  const walk = (n: SyntaxNode) => {
    if (n.type === 'ERROR' || n.isMissing) lines.push(n.startPosition.row + 1)
    for (let i = 0; i < n.childCount; i++) walk(n.child(i))
  }
  walk(tree.rootNode)
  return [...new Set(lines)].sort((a, b) => a - b)
}
