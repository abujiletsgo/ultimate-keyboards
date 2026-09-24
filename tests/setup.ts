// bun test preload: initialise the devicetree parser once from node_modules paths.
import { initDevicetree } from '../src/lib/dt/runtime'

const ROOT = new URL('..', import.meta.url).pathname
await initDevicetree({
  runtime: `${ROOT}node_modules/web-tree-sitter/web-tree-sitter.wasm`,
  grammar: `${ROOT}node_modules/tree-sitter-devicetree/tree-sitter-devicetree.wasm`,
})
