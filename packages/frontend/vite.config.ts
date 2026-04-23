import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));
/** Path where the published package serves static assets from (repo root dist/public). */
const ROOT_PUBLIC_DIR = resolve(CONFIG_DIR, "../../dist/public");
const FRONTEND_DIST_DIR = resolve(CONFIG_DIR, "dist");

/** Copy the built bundle (dist/) into the root dist/public dir after vite build. */
function copyBundleToRootDist() {
  return {
    name: "copy-bundle-to-root-dist",
    apply: "build" as const,
    closeBundle() {
      if (existsSync(ROOT_PUBLIC_DIR)) {
        rmSync(ROOT_PUBLIC_DIR, { recursive: true });
      }

      cpSync(FRONTEND_DIST_DIR, ROOT_PUBLIC_DIR, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyBundleToRootDist()],
  server: {
    port: 5101,
    strictPort: true, // Optional: if true, Vite will exit if the port is already in use
    proxy: {
      "/api": "http://localhost:3101",
      "/ws": {
        target: "ws://localhost:3101",
        ws: true,
      },
    },
  },
});
