import { describe, expect, it } from "vitest";
import { AGENT_TYPE, AgentConfigSchema, type AgentConfig, type SessionHistory } from "@crow-central-agency/shared";
import { resolveBranchSource } from "./session-branch.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

const WORKSPACE = "/ws";
const BRANCH_POINT = { sessionId: "s0", fromMessageId: "anchor-uuid" };

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

function makeHistory(workspace = WORKSPACE): SessionHistory[] {
  return [
    { sessionId: "older", lastUpdatedTimestamp: 500, label: "older", workspace },
    { sessionId: "s0", lastUpdatedTimestamp: 1000, label: "source", workspace },
  ];
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

describe("resolveBranchSource", () => {
  it("returns the ledger entry naming the branched session", () => {
    const history = makeHistory();

    const sourceEntry = resolveBranchSource(makeAgent(), history, BRANCH_POINT, WORKSPACE);

    expect(sourceEntry).toBe(history[1]);
  });

  it("resolves an entry that is not the agent's active session", () => {
    const history = makeHistory();

    const sourceEntry = resolveBranchSource(makeAgent(), history, BRANCH_POINT, WORKSPACE);

    expect(sourceEntry.sessionId).toBe("s0");
  });

  it("rejects a non-Claude agent", () => {
    expectAppErrorCode(
      () =>
        resolveBranchSource(
          makeAgent({ type: AGENT_TYPE.GITHUB_COPILOT }),
          makeHistory(),
          BRANCH_POINT,
          WORKSPACE
        ),
      APP_ERROR_CODES.NOT_SUPPORTED
    );
  });

  it("rejects an agent that does not persist sessions", () => {
    expectAppErrorCode(
      () => resolveBranchSource(makeAgent({ persistSession: false }), makeHistory(), BRANCH_POINT, WORKSPACE),
      APP_ERROR_CODES.VALIDATION
    );
  });

  it("accepts an agent whose persistSession is unset", () => {
    expect(() => resolveBranchSource(makeAgent(), makeHistory(), BRANCH_POINT, WORKSPACE)).not.toThrow();
  });

  it("rejects a session that names no ledger entry", () => {
    expectAppErrorCode(
      () =>
        resolveBranchSource(
          makeAgent(),
          makeHistory(),
          { sessionId: "evicted", fromMessageId: "anchor-uuid" },
          WORKSPACE
        ),
      APP_ERROR_CODES.SESSION_NOT_FOUND
    );
  });

  it("rejects when the ledger is empty", () => {
    expectAppErrorCode(
      () => resolveBranchSource(makeAgent(), undefined, BRANCH_POINT, WORKSPACE),
      APP_ERROR_CODES.SESSION_NOT_FOUND
    );
  });

  // The fork lands under the entry's workspace while the following turn runs under the agent's
  // current one; ensureValidSession would silently drop the fork on a divergence.
  it("rejects when the agent's workspace moved since the source session", () => {
    expectAppErrorCode(
      () => resolveBranchSource(makeAgent(), makeHistory("/old-ws"), BRANCH_POINT, WORKSPACE),
      APP_ERROR_CODES.CONFLICT
    );
  });
});
