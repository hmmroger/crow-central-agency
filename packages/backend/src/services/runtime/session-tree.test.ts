import { describe, expect, it } from "vitest";
import { isEqual } from "es-toolkit";
import { MAX_SESSION_HISTORY, type SessionHistory } from "@crow-central-agency/shared";
import { buildSessionTree, sessionTreeOrder } from "./session-tree.js";
import { upsertSessionHistory } from "./session-history.js";
import type { SessionHistoryAppend } from "./session-history.types.js";

function makeEntry(sessionId: string, timestamp: number, branchParent?: string): SessionHistory {
  const entry: SessionHistory = {
    sessionId,
    lastUpdatedTimestamp: timestamp,
    label: `label ${sessionId}`,
    workspace: "/ws",
  };

  if (branchParent !== undefined) {
    entry.branchPoint = { sessionId: branchParent, fromMessageId: `${sessionId}-from` };
  }

  return entry;
}

function orderOf(history: SessionHistory[]): string[] {
  return buildSessionTree(history).map((node) => node.sessionId);
}

function depthOf(history: SessionHistory[]): Record<string, number> {
  return Object.fromEntries(buildSessionTree(history).map((node) => [node.sessionId, node.depth]));
}

describe("buildSessionTree", () => {
  it("returns nothing for an empty or absent ledger", () => {
    expect(buildSessionTree(undefined)).toEqual([]);
    expect(buildSessionTree([])).toEqual([]);
  });

  it("orders a branchless ledger by recency, all at depth zero", () => {
    const history = [makeEntry("s1", 1000), makeEntry("s2", 3000), makeEntry("s3", 2000)];

    expect(buildSessionTree(history)).toEqual([
      { sessionId: "s2", label: "label s2", lastUpdatedTimestamp: 3000, depth: 0, isBranch: false },
      { sessionId: "s3", label: "label s3", lastUpdatedTimestamp: 2000, depth: 0, isBranch: false },
      { sessionId: "s1", label: "label s1", lastUpdatedTimestamp: 1000, depth: 0, isBranch: false },
    ]);
  });

  it("raises a whole family on its most recent branch, keeping the root first", () => {
    const history = [
      makeEntry("old-root", 1000),
      makeEntry("recent-branch", 5000, "old-root"),
      makeEntry("other", 3000),
    ];

    // The root is older than `other` and still leads, because the family sorts on its branch.
    expect(orderOf(history)).toEqual(["old-root", "recent-branch", "other"]);
  });

  it("orders siblings by their own subtree's most recent entry", () => {
    const history = [
      makeEntry("root", 1000),
      makeEntry("quiet-branch", 2000, "root"),
      makeEntry("busy-branch", 5000, "root"),
      makeEntry("deep-leaf", 9000, "quiet-branch"),
    ];

    // quiet-branch leads on its leaf's timestamp, not on its own.
    expect(orderOf(history)).toEqual(["root", "quiet-branch", "deep-leaf", "busy-branch"]);
  });

  it("increments depth once per branch level along a chain", () => {
    const history = [makeEntry("s1", 1000), makeEntry("s2", 2000, "s1"), makeEntry("s3", 3000, "s2")];

    expect(depthOf(history)).toEqual({ s1: 0, s2: 1, s3: 2 });
  });

  it("marks every entry carrying a branch point as a branch", () => {
    const history = [makeEntry("root", 1000), makeEntry("branch", 2000, "root")];

    expect(buildSessionTree(history).map((node) => node.isBranch)).toEqual([false, true]);
  });

  it("roots an entry whose branch source is gone, still marking it a branch", () => {
    const history = [makeEntry("kept", 1000), makeEntry("orphan", 4000, "evicted")];

    expect(buildSessionTree(history)).toEqual([
      { sessionId: "orphan", label: "label orphan", lastUpdatedTimestamp: 4000, depth: 0, isBranch: true },
      { sessionId: "kept", label: "label kept", lastUpdatedTimestamp: 1000, depth: 0, isBranch: false },
    ]);
  });

  it("falls back to ledger order when subtree maxima tie", () => {
    const history = [makeEntry("first", 1000), makeEntry("second", 1000), makeEntry("third", 1000)];

    // Ledger order is creation order, the only fallback here that carries meaning.
    expect(orderOf(history)).toEqual(["first", "second", "third"]);
    const siblings = [makeEntry("root", 5000), makeEntry("left", 1000, "root"), makeEntry("right", 1000, "root")];
    expect(orderOf(siblings)).toEqual(["root", "left", "right"]);
  });

  it("does not depend on the ledger's array order", () => {
    const appendOrder = [
      makeEntry("root", 1000),
      makeEntry("quiet-branch", 2000, "root"),
      makeEntry("busy-branch", 5000, "root"),
      makeEntry("deep-leaf", 9000, "quiet-branch"),
      makeEntry("other-root", 3000),
    ];
    const expected = ["root", "quiet-branch", "deep-leaf", "busy-branch", "other-root"];

    expect(orderOf(appendOrder)).toEqual(expected);
    // Children ahead of their parents, families interleaved.
    expect(orderOf([...appendOrder].reverse())).toEqual(expected);
    expect(orderOf([appendOrder[3], appendOrder[4], appendOrder[1], appendOrder[0], appendOrder[2]])).toEqual(expected);
  });
});

describe("sessionTreeOrder as the agent_sessions_updated condition", () => {
  interface TurnResult {
    emits: boolean;
    order: string[];
  }

  /** What the INIT case does: project either side of the turn's ledger write and compare. */
  function applyTurn(
    history: SessionHistory[],
    sessionId: string,
    timestamp: number,
    branchParent?: string
  ): TurnResult {
    const append: SessionHistoryAppend = {
      sessionId,
      message: `message for ${sessionId}`,
      workspace: "/ws",
      timestamp,
    };
    if (branchParent !== undefined) {
      append.branchPoint = { sessionId: branchParent, fromMessageId: `${sessionId}-from` };
    }

    const orderBefore = sessionTreeOrder(history);
    const orderAfter = sessionTreeOrder(upsertSessionHistory(history, append));

    return { emits: !isEqual(orderBefore, orderAfter), order: orderAfter };
  }

  it("stays quiet when a turn only refreshes the session already leading", () => {
    // The ordinary turn. Its timestamp moves, which is deliberately not part of the comparison.
    const history = [makeEntry("older", 500), makeEntry("current", 1000)];

    expect(applyTurn(history, "current", 2000).emits).toBe(false);
  });

  it("announces a session the ledger did not hold", () => {
    const history = [makeEntry("older", 500), makeEntry("current", 1000)];

    expect(applyTurn(history, "fresh", 2000).emits).toBe(true);
  });

  it("announces a branch of the leading session", () => {
    expect(applyTurn([makeEntry("current", 1000)], "forked", 2000, "current").emits).toBe(true);
  });

  it("announces an eviction", () => {
    const history = Array.from({ length: MAX_SESSION_HISTORY }, (_unused, index) =>
      makeEntry(`s${index}`, 1000 + index)
    );

    const result = applyTurn(history, "overflow", 9000);

    expect(result.emits).toBe(true);
    expect(result.order).not.toContain("s0");
  });

  it("announces an older family being resumed", () => {
    const history = [makeEntry("recent", 5000), makeEntry("stale", 1000)];

    expect(applyTurn(history, "stale", 9000).emits).toBe(true);
  });

  it("announces siblings reordering inside the family already leading", () => {
    // The case an emit rule stated as append/evict/family-rose would miss: the leading family stays
    // leading and no entry is added, yet the rendered order changes.
    const history = [makeEntry("root", 1000), makeEntry("left", 3000, "root"), makeEntry("right", 2000, "root")];

    const result = applyTurn(history, "right", 4000);

    expect(result.emits).toBe(true);
    expect(result.order).toEqual(["root", "right", "left"]);
  });
});
