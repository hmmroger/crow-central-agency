/**
 * Reconcile a persisted display order against the live set of items.
 *
 * - Items whose id appears in `order` are emitted in that order.
 * - Ids in `order` that no longer exist in `items` are ignored.
 * - Items not in `order` are appended at the end, preserving their
 *   original relative order (handles items added after the order was
 *   saved).
 *
 * Pure function — never mutates its inputs.
 */
export function applyAgentOrder<T extends { id: string }>(items: T[], order: string[] | undefined): T[] {
  if (order === undefined || order.length === 0) {
    return [...items];
  }

  const remaining = new Map<string, T>();
  for (const item of items) {
    remaining.set(item.id, item);
  }

  const ordered: T[] = [];
  for (const id of order) {
    const item = remaining.get(id);
    if (item !== undefined) {
      ordered.push(item);
      remaining.delete(id);
    }
  }

  for (const item of items) {
    if (remaining.has(item.id)) {
      ordered.push(item);
    }
  }

  return ordered;
}
