/// <reference types="vite/client" />

/** Injected by vite `define` from package.json. */
declare const __APP_VERSION__: string
/** Injected by vite `define` on the dev server only; undefined in production. */
declare const __DEV_FS_TOKEN__: string | undefined


declare module '*.wasm?url' {
  const url: string
  export default url
}
