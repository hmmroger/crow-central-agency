import { difference } from "es-toolkit";

/** Order-insensitive equality check for arrays treated as sets (no duplicates). */
export function arraysEqualUnordered<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && difference(left, right).length === 0;
}
