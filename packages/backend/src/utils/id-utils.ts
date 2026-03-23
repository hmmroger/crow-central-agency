import { randomUUID } from "node:crypto";

/**
 * Generate a new UUID v4
 */
export function generateId(): string {
  return randomUUID();
}
