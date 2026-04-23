import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const PACKAGES_DIR = resolve(REPO_ROOT, "packages");

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: node scripts/bump-version.mjs <semver>");
  console.error("Example: node scripts/bump-version.mjs 0.25.0");
  process.exit(1);
}

if (!SEMVER_PATTERN.test(newVersion)) {
  console.error(`bump-version: "${newVersion}" is not a valid semver string.`);
  process.exit(1);
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const workspacePackageJsonPaths = readdirSync(PACKAGES_DIR)
  .map((name) => resolve(PACKAGES_DIR, name, "package.json"))
  .filter(isFile);

const packageJsonPaths = [resolve(REPO_ROOT, "package.json"), ...workspacePackageJsonPaths];

for (const packagePath of packageJsonPaths) {
  const raw = readFileSync(packagePath, "utf8");
  const pkg = JSON.parse(raw);
  const previous = pkg.version;

  if (previous === newVersion) {
    console.log(`bump-version: ${packagePath} already ${newVersion}, skipping.`);
    continue;
  }

  pkg.version = newVersion;
  const output = JSON.stringify(pkg, null, 2) + (raw.endsWith("\n") ? "\n" : "");
  writeFileSync(packagePath, output);
  console.log(`bump-version: ${packagePath} ${previous} -> ${newVersion}`);
}
