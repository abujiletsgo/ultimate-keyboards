import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { writeFileSync, existsSync } from "fs";
import { homedir } from "os";

// Dev-only file-write endpoint so the browser dev app can save keymaps to
// disk like the desktop app does (reads go through vite's built-in /@fs/).
// Writes are restricted to .keymap/.json files under the user's home dir.
function devFsWritePlugin(): Plugin {
  return {
    name: "dev-fs-write",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__fs/write", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            const { path, contents } = JSON.parse(body) as { path: string; contents: string };
            const ok =
              typeof path === "string" &&
              typeof contents === "string" &&
              path.startsWith(homedir()) &&
              !path.includes("..") &&
              (path.endsWith(".keymap") || path.endsWith(".json")) &&
              existsSync(path); // only overwrite existing files, never create
            if (!ok) { res.statusCode = 403; res.end("forbidden"); return; }
            writeFileSync(path, contents, "utf8");
            res.statusCode = 200;
            res.end("ok");
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

// When vite runs under the Tauri CLI (dev or build), TAURI_ENV_PLATFORM is set.
// Only alias the Tauri plugins to browser shims for pure-web builds — otherwise
// the packaged desktop app would get throwing fs/dialog stubs and saving breaks.
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  plugins: [react(), tailwindcss(), devFsWritePlugin()],
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
    fs: {
      // Allow /@fs/ reads of keymap repos outside the project root (dev only)
      allow: [".", `${process.env.HOME}/Documents`],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
  },
});
