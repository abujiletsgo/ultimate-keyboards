import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { writeFileSync, existsSync, realpathSync } from "fs";
import { homedir } from "os";
import { randomUUID } from "crypto";
import { sep } from "path";
import { readFileSync } from "fs";

const APP_VERSION = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;

// Per-process secret. Injected into the client bundle via `define`, so only
// pages served by THIS dev server know it — a foreign website can't POST here.
const DEV_FS_TOKEN = randomUUID();
const DEV_FS_ROOT = `${homedir()}${sep}Documents`;

// Dev-only file-write endpoint so the browser dev app can save keymaps to
// disk like the desktop app does (reads go through vite's built-in /@fs/).
// Defence in depth: token header, same-origin Origin header, JSON content
// type, realpath (no symlink escapes) under ~/Documents, config extensions
// only, existing files only. Same boundary as the desktop fs capability.
function devFsWritePlugin(): Plugin {
  return {
    name: "dev-fs-write",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__fs/write", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        const addr = server.httpServer?.address();
        const port = typeof addr === "object" && addr ? addr.port : server.config.server.port;
        const allowedOrigins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
        const origin = String(req.headers.origin ?? "");
        const ctype = String(req.headers["content-type"] ?? "");
        if (
          req.headers["x-dev-fs-token"] !== DEV_FS_TOKEN ||
          !allowedOrigins.has(origin) ||
          !ctype.startsWith("application/json")
        ) { res.statusCode = 403; res.end("forbidden"); return; }
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 2_000_000) req.destroy(); });
        req.on("end", () => {
          try {
            const { path, contents } = JSON.parse(body) as { path: string; contents: string };
            if (typeof path !== "string" || typeof contents !== "string" || !existsSync(path)) {
              res.statusCode = 403; res.end("forbidden"); return;
            }
            const real = realpathSync(path);
            const root = realpathSync(DEV_FS_ROOT);
            const ok =
              real.startsWith(root + sep) &&
              /\.(keymap|json|overlay|conf|dtsi)$/.test(real);
            if (!ok) { res.statusCode = 403; res.end("forbidden"); return; }
            writeFileSync(real, contents, "utf8");
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
  define: {
    __DEV_FS_TOKEN__: JSON.stringify(DEV_FS_TOKEN),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
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
      // Allow /@fs/ reads of keymap repos outside the project root (dev only);
      // same boundary as the desktop fs capability ($DOCUMENT).
      allow: [".", DEV_FS_ROOT],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "esnext",
    assetsInlineLimit: 0,
    minify: "esbuild",
    sourcemap: false,
  },
});
