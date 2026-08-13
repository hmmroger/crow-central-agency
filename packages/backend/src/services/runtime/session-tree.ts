import type { SessionHistory, SessionHistoryNode } from "@crow-central-agency/shared";

/**
 * Project an agent's session ledger into the ordered, depth-annotated list the session panel renders.
 *
 * A family is a root session plus everything transitively branched from it. Families sort by the
 * most recent `lastUpdatedTimestamp` anywhere in the family, so a family rises as a whole when any
 * one of its branches runs. The same rule applies inside a family: a node's children are ordered by
 * their own subtree's maximum, so the ordering is consistent at every depth.
 *
 * Parents are resolved through a lookup built from the whole ledger rather than in a forward pass,
 * so the result does not depend on the order entries arrive in. Equal keys keep ledger order.
 */
export function buildSessionTree(sessionHistory: SessionHistory[] | undefined): SessionHistoryNode[] {
  const entries = sessionHistory ?? [];
  const entryBySessionId = new Map(entries.map((entry) => [entry.sessionId, entry]));
  const childrenByParentId = new Map<string, SessionHistory[]>();
  const roots: SessionHistory[] = [];

  for (const entry of entries) {
    const parentSessionId = entry.branchPoint?.sessionId;
    // A branch whose source is no longer in the ledger has nothing to hang under, so it stands as
    // its own root. It is still a branch: `isBranch` reports the branchPoint, not the parent.
    if (parentSessionId === undefined || !entryBySessionId.has(parentSessionId)) {
      roots.push(entry);
      continue;
    }

    const siblings = childrenByParentId.get(parentSessionId);
    if (siblings) {
      siblings.push(entry);
    } else {
      childrenByParentId.set(parentSessionId, [entry]);
    }
  }

  const subtreeMaxBySessionId = new Map<string, number>();
  const resolveSubtreeMax = (entry: SessionHistory): number => {
    const cached = subtreeMaxBySessionId.get(entry.sessionId);
    if (cached !== undefined) {
      return cached;
    }

    let subtreeMax = entry.lastUpdatedTimestamp;
    for (const child of childrenByParentId.get(entry.sessionId) ?? []) {
      subtreeMax = Math.max(subtreeMax, resolveSubtreeMax(child));
    }

    subtreeMaxBySessionId.set(entry.sessionId, subtreeMax);
    return subtreeMax;
  };

  const orderByRecency = (siblings: SessionHistory[]): SessionHistory[] =>
    [...siblings].sort((left, right) => resolveSubtreeMax(right) - resolveSubtreeMax(left));

  const nodes: SessionHistoryNode[] = [];
  const appendSubtree = (entry: SessionHistory, depth: number): void => {
    nodes.push({
      sessionId: entry.sessionId,
      label: entry.label,
      lastUpdatedTimestamp: entry.lastUpdatedTimestamp,
      depth,
      isBranch: entry.branchPoint !== undefined,
    });

    for (const child of orderByRecency(childrenByParentId.get(entry.sessionId) ?? [])) {
      appendSubtree(child, depth + 1);
    }
  };

  for (const root of orderByRecency(roots)) {
    appendSubtree(root, 0);
  }

  return nodes;
}

/**
 * The projected session ids in render order. Comparing one taken before a ledger write with one
 * taken after says whether the panel's view actually moved — an append, an eviction, a family
 * rising, or siblings swapping within a family — without enumerating those causes.
 *
 * Only ids: `lastUpdatedTimestamp` changes on every turn, so comparing it would report a change
 * every time. Take the earlier snapshot with this function rather than keeping the ledger array,
 * which `upsertSessionHistory` updates in place.
 */
export function sessionTreeOrder(sessionHistory: SessionHistory[] | undefined): string[] {
  return buildSessionTree(sessionHistory).map((node) => node.sessionId);
}
