// bun test preload: initialise the devicetree parser once from node_modules paths.
import { fileURLToPath } from 'node:url'
import { initDevicetree } from '../src/lib/dt/runtime'

// fileURLToPath, not URL.pathname: on Windows .pathname gives '/C:/...', which no file API opens.
const nodeModule = (rel: string) => fileURLToPath(new URL(`../node_modules/${rel}`, import.meta.url))
await initDevicetree({
  runtime: nodeModule('web-tree-sitter/web-tree-sitter.wasm'),
  grammar: nodeModule('tree-sitter-devicetree/tree-sitter-devicetree.wasm'),
})
