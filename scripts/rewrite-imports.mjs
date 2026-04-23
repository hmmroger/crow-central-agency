import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "../dist");
const EMBEDDED_SHARED_DIR = resolve(DIST, "_shared");
const EMBEDDED_SHARED_ENTRY = resolve(EMBEDDED_SHARED_DIR, "index.js");
const SHARED_SPECIFIER = "@crow-central-agency/shared";
const SHARED_IMPORT_PATTERN = /(['"])@crow-central-agency\/shared\1/g;

function toPosixRelative(fromDir, toFile) {
  const rel = relative(fromDir, toFile).split(sep).join(posix.sep);
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function* walkEmittedFiles(root) {
  const entries = readdirSync(root, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const fullPath = resolve(entry.parentPath, entry.name);
    if (fullPath.startsWith(EMBEDDED_SHARED_DIR + sep)) {
      continue;
    }

    const isJs = entry.name.endsWith(".js");
    const isDts = entry.name.endsWith(".d.ts");
    if (!isJs && !isDts) {
      continue;
    }

    yield fullPath;
  }
}

let rewritten = 0;
for (const filePath of walkEmittedFiles(DIST)) {
  const source = readFileSync(filePath, "utf8");
  if (!source.includes(SHARED_SPECIFIER)) {
    continue;
  }

  const relativeEntry = toPosixRelative(dirname(filePath), EMBEDDED_SHARED_ENTRY);
  const replaced = source.replace(SHARED_IMPORT_PATTERN, (_match, quote) => `${quote}${relativeEntry}${quote}`);

  if (replaced !== source) {
    writeFileSync(filePath, replaced);
    rewritten += 1;
  }
}

console.log(`rewrite-imports: rewrote ${rewritten} file(s).`);
