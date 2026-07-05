import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// When vite runs under the Tauri CLI (dev or build), TAURI_ENV_PLATFORM is set.
// Only alias the Tauri plugins to browser shims for pure-web builds — otherwise
// the packaged desktop app would get throwing fs/dialog stubs and saving breaks.
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      ...(isTauri
        ? {}
        : {
            "@tauri-apps/plugin-fs": resolve(__dirname, "./src/lib/tauri-web-shims/plugin-fs.ts"),
            "@tauri-apps/api/path": resolve(__dirname, "./src/lib/tauri-web-shims/api-path.ts"),
            "@tauri-apps/plugin-dialog": resolve(__dirname, "./src/lib/tauri-web-shims/plugin-dialog.ts"),
          }),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
  },
});
