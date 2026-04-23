import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const ROOT_DIST = resolve(REPO_ROOT, "dist");

const destSubpath = process.argv[2] ?? "";
const SOURCE_DIST = resolve(process.cwd(), "dist");
const TARGET = destSubpath ? resolve(ROOT_DIST, destSubpath) : ROOT_DIST;

if (!existsSync(SOURCE_DIST)) {
  throw new Error(`Source dist not found at ${SOURCE_DIST}. Run tsc before copying.`);
}

// If we're copying into a dedicated subpath, wipe it first to avoid stale files.
// Otherwise we're merging into the shared root dist (where other packages also write).
if (destSubpath) {
  rmSync(TARGET, { recursive: true, force: true });
}

mkdirSync(TARGET, { recursive: true });
cpSync(SOURCE_DIST, TARGET, {
  recursive: true,
});

console.log(`copy-to-root-dist: ${process.cwd()} -> ${TARGET}`);
