import { describe, expect, it } from "vitest";
import type { SessionHistory } from "@crow-central-agency/shared";
import { buildSessionTree } from "./session-tree.js";

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
    const history = [makeEntry("old-root", 1000), makeEntry("recent-branch", 5000, "old-root"), makeEntry("other", 3000)];

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
