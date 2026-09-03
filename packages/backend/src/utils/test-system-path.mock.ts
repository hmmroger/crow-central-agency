import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TEMP_DIR_PREFIX = "crow-backend-test-";

/** The only paths this module will ever delete: the ones it created itself */
const ownedPaths = new Set<string>();

let tempSystemPath: string | undefined;

/** Must run before config/env.js is imported — that module captures CROW_SYSTEM_PATH at load time. */
export async function useTempSystemPath(): Promise<string> {
  const created = path.resolve(await mkdtemp(path.join(os.tmpdir(), TEMP_DIR_PREFIX)));

  ownedPaths.add(created);
  tempSystemPath = created;
  process.env.CROW_SYSTEM_PATH = created;

  return created;
}

export function getTempSystemPath(): string {
  if (tempSystemPath === undefined) {
    throw new Error("useTempSystemPath() has not run — check that the vitest setup file is configured");
  }

  return tempSystemPath;
}

/** Empty the temp directory between tests, keeping the directory itself */
export async function clearTempSystemPath(): Promise<void> {
  const target = assertOwned(getTempSystemPath());

  for (const entry of await readdir(target)) {
    await rm(path.join(target, entry), { recursive: true, force: true });
  }
}

export async function removeTempSystemPath(): Promise<void> {
  const target = assertOwned(getTempSystemPath());

  try {
    await rm(target, { recursive: true, force: true });
  } finally {
    ownedPaths.delete(target);
    tempSystemPath = undefined;
  }
}

function assertOwned(target: string): string {
  const resolved = path.resolve(target);

  if (!ownedPaths.has(resolved)) {
    throw new Error(`Refusing to delete "${resolved}": this helper did not create it`);
  }

  const tempRoot = path.resolve(os.tmpdir());
  if (resolved === tempRoot || !resolved.startsWith(`${tempRoot}${path.sep}`)) {
    throw new Error(`Refusing to delete "${resolved}": it is not inside ${tempRoot}`);
  }

  return resolved;
}
