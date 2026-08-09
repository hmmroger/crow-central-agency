import { describe, expect, it } from "vitest";
import { SESSION_HISTORY_ACTIVE_WINDOW, type SessionHistory } from "@crow-central-agency/shared";
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

  it("refreshes only the timestamp when the incoming id matches the last entry", () => {
    const history = [makeEntry("s1", 1000)];

    const result = upsertSessionHistory(history, {
      sessionId: "s1",
      message: "a brand new message that must not become the label",
      workspace: "/other",
      timestamp: 2000,
    });

    expect(result).toEqual([{ sessionId: "s1", lastUpdatedTimestamp: 2000, label: "s1", workspace: "/ws" }]);
  });

  it("appends a new entry when the incoming id differs from the last entry", () => {
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
  it("retains a family while a transitive descendant sits in the active window", () => {
    const history = [
      makeEntry("root", 1),
      makeEntry("child", 2, "root"),
      ...singletons("s", SESSION_HISTORY_ACTIVE_WINDOW - 2, 100),
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
      ...singletons("s", SESSION_HISTORY_ACTIVE_WINDOW, 100),
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
    expect(result).toHaveLength(SESSION_HISTORY_ACTIVE_WINDOW);
    assertNoDanglingBranchPoints(result);
  });

  it("retains sibling branches together via their shared root", () => {
    const history = [
      makeEntry("root", 1),
      makeEntry("childA", 2, "root"),
      ...singletons("s", SESSION_HISTORY_ACTIVE_WINDOW - 2, 100),
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
