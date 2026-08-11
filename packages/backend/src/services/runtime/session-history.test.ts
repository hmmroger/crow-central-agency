import { describe, expect, it } from "vitest";
import { MAX_SESSION_HISTORY, type SessionHistory } from "@crow-central-agency/shared";
import { deriveSessionLabel, upsertSessionHistory } from "./session-history.js";

function makeEntry(sessionId: string, timestamp: number, branchParent?: string): SessionHistory {
  const entry: SessionHistory = {
    sessionId,
    lastUpdatedTimestamp: timestamp,
    label: sessionId,
    workspace: "/ws",
  };

  if (branchParent !== undefined) {
    entry.branchPoint = { sessionId: branchParent, fromMessageId: `${sessionId}-from` };
  }

  return entry;
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

describe("deriveSessionLabel", () => {
  it("passes a short message through unchanged", () => {
    expect(deriveSessionLabel("plan the release")).toBe("plan the release");
  });

  it("collapses runs of whitespace", () => {
    expect(deriveSessionLabel("  plan   the\n\trelease ")).toBe("plan the release");
  });

  it("keeps exactly 30 words without an ellipsis", () => {
    const words = Array.from({ length: 30 }, (_unused, index) => `w${index}`);
    expect(deriveSessionLabel(words.join(" "))).toBe(words.join(" "));
  });

  it("truncates to the first 30 words and appends an ellipsis", () => {
    const words = Array.from({ length: 40 }, (_unused, index) => `w${index}`);
    const label = deriveSessionLabel(words.join(" "));
    expect(label).toBe(words.slice(0, 30).join(" ") + "...");
  });
});

describe("upsertSessionHistory", () => {
  it("appends the first entry when history is undefined", () => {
    const result = upsertSessionHistory(undefined, {
      sessionId: "s1",
      message: "start work",
      workspace: "/ws",
      timestamp: 1000,
    });

    expect(result).toEqual([
      { sessionId: "s1", lastUpdatedTimestamp: 1000, label: "start work", workspace: "/ws" },
    ]);
  });

  it("refreshes only the timestamp when the incoming id matches an entry", () => {
    const history = [makeEntry("s1", 1000)];

    const result = upsertSessionHistory(history, {
      sessionId: "s1",
      message: "a brand new message that must not become the label",
      workspace: "/other",
      timestamp: 2000,
    });

    expect(result).toEqual([{ sessionId: "s1", lastUpdatedTimestamp: 2000, label: "s1", workspace: "/ws" }]);
  });

  it("refreshes the matched entry in place instead of rebuilding the ledger", () => {
    const matchedEntry = makeEntry("s1", 1000);
    const history = [makeEntry("s0", 500), matchedEntry];

    const result = upsertSessionHistory(history, {
      sessionId: "s1",
      message: "same session",
      workspace: "/ws",
      timestamp: 2000,
    });

    expect(result).toBe(history);
    expect(result[1]).toBe(matchedEntry);
    expect(matchedEntry.lastUpdatedTimestamp).toBe(2000);
  });

  it("refreshes an entry that is not the last one without moving or appending it", () => {
    const history = [makeEntry("s0", 500), makeEntry("s1", 1000), makeEntry("s2", 1500)];

    const result = upsertSessionHistory(history, {
      sessionId: "s1",
      message: "revisited",
      workspace: "/ws",
      timestamp: 2000,
    });

    expect(result.map((entry) => entry.sessionId)).toEqual(["s0", "s1", "s2"]);
    expect(result[1].lastUpdatedTimestamp).toBe(2000);
  });

  it("stores the branch point verbatim on a branched entry", () => {
    const branchPoint = { sessionId: "s0", fromMessageId: "anchor-uuid" };

    const result = upsertSessionHistory([makeEntry("s0", 500)], {
      sessionId: "s1",
      message: "try another approach",
      workspace: "/ws",
      timestamp: 2000,
      branchPoint,
    });

    expect(result[1]).toEqual({
      sessionId: "s1",
      lastUpdatedTimestamp: 2000,
      label: "try another approach",
      workspace: "/ws",
      branchPoint: { sessionId: "s0", fromMessageId: "anchor-uuid" },
    });
  });

  it("leaves the branch point unset on an ordinary entry", () => {
    const result = upsertSessionHistory(undefined, {
      sessionId: "s1",
      message: "start work",
      workspace: "/ws",
      timestamp: 1000,
    });

    expect(result[0].branchPoint).toBeUndefined();
  });

  it("keeps the branch point when the branched session is revisited", () => {
    const history = upsertSessionHistory([makeEntry("s0", 500)], {
      sessionId: "s1",
      message: "try another approach",
      workspace: "/ws",
      timestamp: 2000,
      branchPoint: { sessionId: "s0", fromMessageId: "anchor-uuid" },
    });

    const result = upsertSessionHistory(history, {
      sessionId: "s1",
      message: "the run that resumes the fork",
      workspace: "/ws",
      timestamp: 3000,
    });

    expect(result[1].branchPoint).toEqual({ sessionId: "s0", fromMessageId: "anchor-uuid" });
    expect(result[1].lastUpdatedTimestamp).toBe(3000);
  });

  it("keeps the original label when a session is revisited", () => {
    const history = [makeEntry("s0", 500), makeEntry("s1", 1000)];

    const result = upsertSessionHistory(history, {
      sessionId: "s0",
      message: "a much later message that must not relabel the session",
      workspace: "/ws",
      timestamp: 2000,
    });

    expect(result[0].label).toBe("s0");
  });

  it("appends a new entry when the incoming id matches no entry", () => {
    const history = [makeEntry("s1", 1000)];

    const result = upsertSessionHistory(history, {
      sessionId: "s2",
      message: "second session",
      workspace: "/ws",
      timestamp: 2000,
    });

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ sessionId: "s2", lastUpdatedTimestamp: 2000, label: "second session", workspace: "/ws" });
  });
});

describe("upsertSessionHistory family-aware eviction", () => {
  it("retains a family while a transitive descendant sits in the window", () => {
    const history = [
      makeEntry("root", 1),
      makeEntry("child", 2, "root"),
      ...singletons("s", MAX_SESSION_HISTORY - 2, 100),
      makeEntry("grandchild", 500, "child"),
    ];

    const result = upsertSessionHistory(history, {
      sessionId: "fresh",
      message: "new turn",
      workspace: "/ws",
      timestamp: 900,
    });

    const ids = result.map((entry) => entry.sessionId);
    expect(ids).toContain("root");
    expect(ids).toContain("child");
    expect(ids).toContain("grandchild");
    assertNoDanglingBranchPoints(result);
  });

  it("evicts a family whole once every member has fallen out of the window", () => {
    const history = [
      makeEntry("root", 1),
      makeEntry("child", 2, "root"),
      ...singletons("s", MAX_SESSION_HISTORY, 100),
    ];

    const result = upsertSessionHistory(history, {
      sessionId: "fresh",
      message: "new turn",
      workspace: "/ws",
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

    const result = upsertSessionHistory(history, {
      sessionId: "fresh",
      message: "new turn",
      workspace: "/ws",
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

    const result = upsertSessionHistory(history, {
      sessionId: "fresh",
      message: "new turn",
      workspace: "/ws",
      timestamp: 900,
    });

    const ids = result.map((entry) => entry.sessionId);
    expect(ids).toContain("root");
    expect(ids).toContain("childA");
    expect(ids).toContain("childB");
    assertNoDanglingBranchPoints(result);
  });
});
