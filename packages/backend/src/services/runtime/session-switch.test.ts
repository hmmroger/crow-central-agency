import { describe, expect, it } from "vitest";
import type { SessionHistory } from "@crow-central-agency/shared";
import { resolveSwitchTarget } from "./session-switch.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

const WORKSPACE = "/ws";

function makeHistory(workspace = WORKSPACE): SessionHistory[] {
  return [
    { sessionId: "older", lastUpdatedTimestamp: 500, label: "older", workspace },
    { sessionId: "target", lastUpdatedTimestamp: 1000, label: "target", workspace },
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

describe("resolveSwitchTarget", () => {
  it("returns the ledger entry naming the target session", () => {
    const history = makeHistory();

    expect(resolveSwitchTarget(history, "target", WORKSPACE)).toBe(history[1]);
  });

  it("resolves a branched entry like any other", () => {
    const history: SessionHistory[] = [
      ...makeHistory(),
      {
        sessionId: "branched",
        lastUpdatedTimestamp: 2000,
        label: "branched",
        workspace: WORKSPACE,
        branchPoint: { sessionId: "target", fromMessageId: "anchor-uuid" },
      },
    ];

    expect(resolveSwitchTarget(history, "branched", WORKSPACE)).toBe(history[2]);
  });

  it("rejects a session that names no ledger entry", () => {
    expectAppErrorCode(
      () => resolveSwitchTarget(makeHistory(), "unknown", WORKSPACE),
      APP_ERROR_CODES.SESSION_NOT_FOUND
    );
  });

  it("rejects when the ledger is empty", () => {
    expectAppErrorCode(() => resolveSwitchTarget([], "target", WORKSPACE), APP_ERROR_CODES.SESSION_NOT_FOUND);
    expectAppErrorCode(() => resolveSwitchTarget(undefined, "target", WORKSPACE), APP_ERROR_CODES.SESSION_NOT_FOUND);
  });

  it("rejects when the agent's workspace moved since the target session", () => {
    expectAppErrorCode(
      () => resolveSwitchTarget(makeHistory("/old-ws"), "target", WORKSPACE),
      APP_ERROR_CODES.CONFLICT
    );
  });
});
