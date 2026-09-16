import os from "node:os";

export const DEFAULT_INSPECT_JSON_DEPTH = 2;
export const DEFAULT_INSPECT_JSON_LINES = 200;
export const MAX_INSPECT_JSON_ARRAY_ITEMS = 50;
export const MAX_INSPECT_JSON_VALUE_LENGTH = 200;
export const MAX_INSPECT_JSON_FILE_BYTES = 10 * 1024 * 1024;

/** Directories a filePath may resolve into. The workspace is per-agent, so the set is built per call. */
export const getInspectJsonAllowedBases = (agentWorkspace: string): string[] => [agentWorkspace, os.tmpdir()];
