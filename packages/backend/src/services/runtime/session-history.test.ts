import { describe, expect, it } from "vitest";
import {
  AGENT_TYPE,
  AgentConfigSchema,
  MAX_SESSION_HISTORY,
  type AgentConfig,
  type SessionHistory,
  type SessionHistoryNode,
} from "@crow-central-agency/shared";
import {
  SESSION_LABEL_MAX_WORDS,
  assertBranchSource,
  assertSwitchTarget,
  buildSessionTree,
  deriveSessionLabel,
  updateSessionHistory,
} from "./session-history.js";
import type { SessionHistoryUpdate, UpdatedSessionHistory } from "./session-history.types.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

const BRANCH_POINT = { sessionId: "target", fromMessageId: "anchor-uuid" };

function makeEntry(sessionId: string, timestamp: number, branchParent?: string): SessionHistory {
  const entry: SessionHistory = {
    sessionId,
    lastUpdatedTimestamp: timestamp,
    label: `label ${sessionId}`,
  };

  if (branchParent !== undefined) {
    entry.branchPoint = { sessionId: branchParent, fromMessageId: `${sessionId}-from` };
  }

  return entry;
}

/** A two-entry ledger for the guards, whose second entry is what BRANCH_POINT names. */
function makeHistory(): SessionHistory[] {
  return [
    { sessionId: "older", lastUpdatedTimestamp: 500, label: "label older" },
    { sessionId: "target", lastUpdatedTimestamp: 1000, label: "label target" },
  ];
}

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return AgentConfigSchema.parse({
    id: "3f8a1c2d-9b4e-4a7f-8c1d-2e5b7a9f0c34",
    type: AGENT_TYPE.CLAUDE_CODE,
    name: "Test Agent",
    createdAt: "2026-08-11T00:00:00Z",
    updatedAt: "2026-08-11T00:00:00Z",
    ...overrides,
  });
}

function singletons(prefix: string, count: number, startTimestamp: number): SessionHistory[] {
  return Array.from({ length: count }, (_unused, index) => makeEntry(`${prefix}${index}`, startTimestamp + index));
}

function assertNoDanglingBranchPoints(entries: SessionHistory[]): void {
  const presentIds = new Set(entries.map((entry) => entry.sessionId));
  for (const entry of entries) {
    if (entry.branchPoint !== undefined) {
      expect(presentIds.has(entry.branchPoint.sessionId)).toBe(true);
    }
  }
}

function expectAppErrorCode(operation: () => unknown, errorCode: string): void {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(AppError);
  expect(caught instanceof AppError ? caught.errorCode : undefined).toBe(errorCode);
}

function orderOf(history: SessionHistory[]): string[] {
  return buildSessionTree(history).map((node) => node.sessionId);
}

function depthOf(history: SessionHistory[]): Record<string, number> {
  return Object.fromEntries(buildSessionTree(history).map((node) => [node.sessionId, node.depth]));
}

function makeUpdate(sessionId: string, timestamp: number, branchParent?: string): SessionHistoryUpdate {
  const update: SessionHistoryUpdate = {
    sessionId,
    message: `message for ${sessionId}`,
    timestamp,
  };

  if (branchParent !== undefined) {
    update.branchPoint = { sessionId: branchParent, fromMessageId: `${sessionId}-from` };
  }

  return update;
}

/** An update as the manager makes one: against the ledger and the tree standing over it. */
function applyUpdate(history: SessionHistory[] | undefined, update: SessionHistoryUpdate): UpdatedSessionHistory {
  return updateSessionHistory(history, buildSessionTree(history), update);
}

/** The tree an update had to rebuild, failing the test when the standing tree absorbed it instead. */
function rebuiltTreeOf(updated: UpdatedSessionHistory): SessionHistoryNode[] {
  if (updated.sessionTree === undefined) {
    throw new Error("Expected the update to rebuild the session tree.");
  }

  return updated.sessionTree;
}

describe("deriveSessionLabel", () => {
  it("passes a short message through unchanged", () => {
    expect(deriveSessionLabel("plan the release")).toBe("plan the release");
  });

  it("collapses runs of whitespace", () => {
    expect(deriveSessionLabel("  plan   the\n\trelease ")).toBe("plan the release");
  });

  it("keeps a message at the word limit without an ellipsis", () => {
    const words = Array.from({ length: SESSION_LABEL_MAX_WORDS }, (_unused, index) => `w${index}`);
    expect(deriveSessionLabel(words.join(" "))).toBe(words.join(" "));
  });

  it("truncates a message past the word limit and appends an ellipsis", () => {
    const words = Array.from({ length: SESSION_LABEL_MAX_WORDS + 1 }, (_unused, index) => `w${index}`);
    const label = deriveSessionLabel(words.join(" "));
    expect(label).toBe(words.slice(0, SESSION_LABEL_MAX_WORDS).join(" ") + "...");
  });
});

describe("updateSessionHistory ledger", () => {
  it("appends the first entry when history is undefined", () => {
    const { history: result } = applyUpdate(undefined, {
      sessionId: "s1",
      message: "start work",
      timestamp: 1000,
    });

    expect(result).toEqual([{ sessionId: "s1", lastUpdatedTimestamp: 1000, label: "start work" }]);
  });

  it("refreshes only the timestamp when the incoming id matches an entry", () => {
    const history = [makeEntry("s1", 1000)];

    const { history: result } = applyUpdate(history, {
      sessionId: "s1",
      message: "a brand new message that must not become the label",
      timestamp: 2000,
    });

    expect(result).toEqual([{ sessionId: "s1", lastUpdatedTimestamp: 2000, label: "label s1" }]);
  });

  it("refreshes the matched entry in place instead of rebuilding the ledger", () => {
    const matchedEntry = makeEntry("s1", 1000);
    const history = [makeEntry("s0", 500), matchedEntry];

    const { history: result } = applyUpdate(history, {
      sessionId: "s1",
      message: "same session",
      timestamp: 2000,
    });

    expect(result).toBe(history);
    expect(result[1]).toBe(matchedEntry);
    expect(matchedEntry.lastUpdatedTimestamp).toBe(2000);
  });

  it("refreshes an entry that is not the last one without moving or appending it", () => {
    const history = [makeEntry("s0", 500), makeEntry("s1", 1000), makeEntry("s2", 1500)];

    const { history: result } = applyUpdate(history, {
      sessionId: "s1",
      message: "revisited",
      timestamp: 2000,
    });

    expect(result.map((entry) => entry.sessionId)).toEqual(["s0", "s1", "s2"]);
    expect(result[1].lastUpdatedTimestamp).toBe(2000);
  });

  it("stores the branch point verbatim on a branched entry", () => {
    const branchPoint = { sessionId: "s0", fromMessageId: "anchor-uuid" };

    const { history: result } = applyUpdate([makeEntry("s0", 500)], {
      sessionId: "s1",
      message: "try another approach",
      timestamp: 2000,
      branchPoint,
    });

    expect(result[1]).toEqual({
      sessionId: "s1",
      lastUpdatedTimestamp: 2000,
      label: "try another approach",
      branchPoint: { sessionId: "s0", fromMessageId: "anchor-uuid" },
    });
  });

  it("leaves the branch point unset on an ordinary entry", () => {
    const { history: result } = applyUpdate(undefined, {
      sessionId: "s1",
      message: "start work",
      timestamp: 1000,
    });

    expect(result[0].branchPoint).toBeUndefined();
  });

  it("keeps the branch point when the branched session is revisited", () => {
    const { history } = applyUpdate([makeEntry("s0", 500)], {
      sessionId: "s1",
      message: "try another approach",
      timestamp: 2000,
      branchPoint: { sessionId: "s0", fromMessageId: "anchor-uuid" },
    });

    const { history: result } = applyUpdate(history, {
      sessionId: "s1",
      message: "the run that resumes the fork",
      timestamp: 3000,
    });

    expect(result[1].branchPoint).toEqual({ sessionId: "s0", fromMessageId: "anchor-uuid" });
    expect(result[1].lastUpdatedTimestamp).toBe(3000);
  });

  it("keeps the original label when a session is revisited", () => {
    const history = [makeEntry("s0", 500), makeEntry("s1", 1000)];

    const { history: result } = applyUpdate(history, {
      sessionId: "s0",
      message: "a much later message that must not relabel the session",
      timestamp: 2000,
    });

    expect(result[0].label).toBe("label s0");
  });

  it("appends a new entry when the incoming id matches no entry", () => {
    const history = [makeEntry("s1", 1000)];

    const { history: result } = applyUpdate(history, {
      sessionId: "s2",
      message: "second session",
      timestamp: 2000,
    });

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      sessionId: "s2",
      lastUpdatedTimestamp: 2000,
      label: "second session",
    });
  });
});

describe("updateSessionHistory family-aware eviction", () => {
  it("retains a family while a transitive descendant sits in the window", () => {
    const history = [
      makeEntry("root", 1),
      makeEntry("child", 2, "root"),
      ...singletons("s", MAX_SESSION_HISTORY - 2, 100),
      makeEntry("grandchild", 500, "child"),
    ];

    const { history: result } = applyUpdate(history, {
      sessionId: "fresh",
      message: "new turn",
      timestamp: 900,
    });

    const ids = result.map((entry) => entry.sessionId);
    expect(ids).toContain("root");
    expect(ids).toContain("child");
    expect(ids).toContain("grandchild");
    assertNoDanglingBranchPoints(result);
  });

  it("evicts a family whole once every member has fallen out of the window", () => {
    const history = [makeEntry("root", 1), makeEntry("child", 2, "root"), ...singletons("s", MAX_SESSION_HISTORY, 100)];

    const { history: result } = applyUpdate(history, {
      sessionId: "fresh",
      message: "new turn",
      timestamp: 900,
    });

    const ids = result.map((entry) => entry.sessionId);
    expect(ids).not.toContain("root");
    expect(ids).not.toContain("child");
    expect(result).toHaveLength(MAX_SESSION_HISTORY);
    assertNoDanglingBranchPoints(result);
  });

  it("treats an entry whose branch parent is absent as a family of its own", () => {
    const history = [
      makeEntry("orphanA", 1, "ghost"),
      makeEntry("orphanB", 2, "ghost"),
      ...singletons("s", MAX_SESSION_HISTORY - 1, 100),
    ];

    const { history: result } = applyUpdate(history, {
      sessionId: "fresh",
      message: "new turn",
      timestamp: 900,
    });

    const ids = result.map((entry) => entry.sessionId);
    expect(ids).not.toContain("orphanA");
    expect(ids).not.toContain("orphanB");
    expect(result).toHaveLength(MAX_SESSION_HISTORY);
  });

  it("retains sibling branches together via their shared root", () => {
    const history = [
      makeEntry("root", 1),
      makeEntry("childA", 2, "root"),
      ...singletons("s", MAX_SESSION_HISTORY - 2, 100),
      makeEntry("childB", 500, "root"),
    ];

    const { history: result } = applyUpdate(history, {
      sessionId: "fresh",
      message: "new turn",
      timestamp: 900,
    });

    const ids = result.map((entry) => entry.sessionId);
    expect(ids).toContain("root");
    expect(ids).toContain("childA");
    expect(ids).toContain("childB");
    assertNoDanglingBranchPoints(result);
  });
});

describe("assertBranchSource", () => {
  it("accepts a session the ledger holds", () => {
    expect(() => assertBranchSource(makeAgent(), makeHistory(), BRANCH_POINT)).not.toThrow();
  });

  it("rejects an agent that does not persist sessions", () => {
    expectAppErrorCode(
      () => assertBranchSource(makeAgent({ persistSession: false }), makeHistory(), BRANCH_POINT),
      APP_ERROR_CODES.VALIDATION
    );
  });

  it("accepts an agent whose persistSession is unset", () => {
    expect(() => assertBranchSource(makeAgent(), makeHistory(), BRANCH_POINT)).not.toThrow();
  });

  it("rejects a session that names no ledger entry", () => {
    expectAppErrorCode(
      () => assertBranchSource(makeAgent(), makeHistory(), { sessionId: "evicted", fromMessageId: "anchor" }),
      APP_ERROR_CODES.SESSION_NOT_FOUND
    );
  });

  it("rejects when the ledger is empty", () => {
    expectAppErrorCode(
      () => assertBranchSource(makeAgent(), undefined, BRANCH_POINT),
      APP_ERROR_CODES.SESSION_NOT_FOUND
    );
  });
});

describe("assertSwitchTarget", () => {
  it("accepts a session the ledger holds", () => {
    expect(() => assertSwitchTarget(makeHistory(), "target")).not.toThrow();
  });

  it("accepts a branched entry like any other", () => {
    const history: SessionHistory[] = [
      ...makeHistory(),
      {
        sessionId: "branched",
        lastUpdatedTimestamp: 2000,
        label: "branched",
        branchPoint: BRANCH_POINT,
      },
    ];

    expect(() => assertSwitchTarget(history, "branched")).not.toThrow();
  });

  it("rejects a session that names no ledger entry", () => {
    expectAppErrorCode(() => assertSwitchTarget(makeHistory(), "unknown"), APP_ERROR_CODES.SESSION_NOT_FOUND);
  });

  it("rejects when the ledger is empty", () => {
    expectAppErrorCode(() => assertSwitchTarget([], "target"), APP_ERROR_CODES.SESSION_NOT_FOUND);
    expectAppErrorCode(() => assertSwitchTarget(undefined, "target"), APP_ERROR_CODES.SESSION_NOT_FOUND);
  });
});

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

  it("keeps siblings in the order they were branched, whatever their recency", () => {
    const history = [
      makeEntry("root", 1000),
      makeEntry("first-branch", 2000, "root"),
      makeEntry("second-branch", 9000, "root"),
    ];

    expect(orderOf(history)).toEqual(["root", "first-branch", "second-branch"]);
  });

  it("holds a session's place when a sibling runs, so the tree does not reshuffle", () => {
    const history = [
      makeEntry("root", 1000),
      makeEntry("first-branch", 2000, "root"),
      makeEntry("second-branch", 3000, "root"),
    ];
    const before = orderOf(history);

    history[1].lastUpdatedTimestamp = 9000;

    expect(orderOf(history)).toEqual(before);
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

  it("falls back to ledger order when families tie on recency", () => {
    const history = [makeEntry("first", 1000), makeEntry("second", 1000), makeEntry("third", 1000)];

    // Ledger order is creation order, the only fallback here that carries meaning.
    expect(orderOf(history)).toEqual(["first", "second", "third"]);
  });

  it("nests a child listed before its parent, so hierarchy does not depend on array order", () => {
    const appendOrder = [
      makeEntry("root", 1000),
      makeEntry("branch", 2000, "root"),
      makeEntry("deep-leaf", 9000, "branch"),
      makeEntry("other-root", 3000),
    ];
    const expectedDepths = { root: 0, branch: 1, "deep-leaf": 2, "other-root": 0 };
    const reverseOrder = appendOrder.toReversed();

    expect(depthOf(appendOrder)).toEqual(expectedDepths);
    expect(depthOf(reverseOrder)).toEqual(expectedDepths);
    // The family still leads on its leaf, which no forward pass over the reversed array would find.
    expect(orderOf(reverseOrder)[0]).toBe("root");
  });
});

describe("updateSessionHistory tree upkeep", () => {
  it("rebuilds nothing for an update on the leading session, refreshing the standing tree in place", () => {
    const history = [makeEntry("older", 500), makeEntry("current", 1000)];
    const sessionTree = buildSessionTree(history);

    const updated = updateSessionHistory(history, sessionTree, makeUpdate("current", 2000));

    expect(updated.sessionTree).toBeUndefined();
    expect(sessionTree[0].lastUpdatedTimestamp).toBe(2000);
  });

  it("rebuilds nothing for an update on a branch under the leading root", () => {
    const history = [makeEntry("root", 1000), makeEntry("left", 3000, "root"), makeEntry("right", 2000, "root")];
    const sessionTree = buildSessionTree(history);

    const updated = updateSessionHistory(history, sessionTree, makeUpdate("right", 4000));

    expect(updated.sessionTree).toBeUndefined();
    expect(sessionTree[2].lastUpdatedTimestamp).toBe(4000);
  });

  it("rebuilds around a session the ledger did not hold", () => {
    const updated = applyUpdate([makeEntry("older", 500), makeEntry("current", 1000)], makeUpdate("fresh", 2000));

    expect(rebuiltTreeOf(updated).map((node) => node.sessionId)).toEqual(["fresh", "current", "older"]);
  });

  it("rebuilds around a branch of the leading session, nesting it", () => {
    const updated = applyUpdate([makeEntry("current", 1000)], makeUpdate("forked", 2000, "current"));

    expect(rebuiltTreeOf(updated).map((node) => node.depth)).toEqual([0, 1]);
  });

  it("rebuilds around an older family being resumed", () => {
    const updated = applyUpdate([makeEntry("recent", 5000), makeEntry("stale", 1000)], makeUpdate("stale", 9000));

    expect(rebuiltTreeOf(updated).map((node) => node.sessionId)).toEqual(["stale", "recent"]);
  });

  it("rebuilds around an eviction", () => {
    const history = Array.from({ length: MAX_SESSION_HISTORY }, (_unused, index) =>
      makeEntry(`s${index}`, 1000 + index)
    );

    const updated = applyUpdate(history, makeUpdate("overflow", 9000));

    expect(rebuiltTreeOf(updated).map((node) => node.sessionId)).not.toContain("s0");
  });

  it("stops at the next root, so a trailing family's branch is not taken for a leading one", () => {
    const history = [
      makeEntry("leader", 9000),
      makeEntry("trailing-root", 1000),
      makeEntry("trailing-branch", 2000, "trailing-root"),
    ];

    const updated = applyUpdate(history, makeUpdate("trailing-branch", 9500));

    expect(rebuiltTreeOf(updated).map((node) => node.sessionId)).toEqual([
      "trailing-root",
      "trailing-branch",
      "leader",
    ]);
  });

  it("rebuilds for the first session an agent ever runs", () => {
    const updated = applyUpdate(undefined, makeUpdate("first-ever", 1000));

    expect(rebuiltTreeOf(updated).map((node) => node.sessionId)).toEqual(["first-ever"]);
  });
});
