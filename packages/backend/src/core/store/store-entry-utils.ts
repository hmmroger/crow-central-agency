import type { StoreEntry } from "./object-store.types.js";

/** Type predicate that checks if a value has the shape of a StoreEntry */
export function isValidStoreEntry(value: unknown): value is StoreEntry<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    "value" in record &&
    typeof record.version === "number" &&
    typeof record.createdAt === "number" &&
    typeof record.updatedAt === "number"
  );
}
