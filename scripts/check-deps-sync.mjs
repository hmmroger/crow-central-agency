import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT_PKG = resolve(HERE, "../package.json");
const BACKEND_PKG = resolve(HERE, "../packages/backend/package.json");

const root = JSON.parse(readFileSync(ROOT_PKG, "utf8"));
const backend = JSON.parse(readFileSync(BACKEND_PKG, "utf8"));

const rootDeps = root.dependencies ?? {};
const backendDeps = backend.dependencies ?? {};

const backendKeys = Object.keys(backendDeps).sort();
const rootKeys = Object.keys(rootDeps).sort();

const missingInRoot = backendKeys.filter((name) => !(name in rootDeps));
const extraInRoot = rootKeys.filter((name) => !(name in backendDeps));
const versionMismatches = backendKeys
  .filter((name) => name in rootDeps && rootDeps[name] !== backendDeps[name])
  .map((name) => ({ name, backend: backendDeps[name], root: rootDeps[name] }));

const problems = [];
if (missingInRoot.length > 0) {
  problems.push(`Missing in root: ${missingInRoot.join(", ")}`);
}
if (extraInRoot.length > 0) {
  problems.push(`Extra in root (not in backend): ${extraInRoot.join(", ")}`);
}
for (const mismatch of versionMismatches) {
  problems.push(`Version mismatch for ${mismatch.name}: backend=${mismatch.backend}, root=${mismatch.root}`);
}

if (problems.length > 0) {
  console.error("check-deps-sync: root runtime deps have drifted from backend:");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error("\nSync package.json#dependencies to match packages/backend/package.json#dependencies.");
  process.exit(1);
}

console.log("check-deps-sync: root runtime deps match backend.");
