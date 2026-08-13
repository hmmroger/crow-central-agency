import type { SessionHistory } from "@crow-central-agency/shared";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

/**
 * Resolve the session-history entry a switch targets, rejecting a switch the agent cannot make.
 *
 * Pure and side-effect free: it throws on the first failing condition, so a rejected switch leaves
 * the agent exactly as it was. The agent's IDLE state and the transcript's existence are checked by
 * the caller, which owns the runner and the session manager.
 *
 * @param sessionHistory the agent's session ledger
 * @param sessionId the session to make current
 * @param currentWorkspace the agent's current resolved workspace
 * @returns The ledger entry being switched to
 */
export function resolveSwitchTarget(
  sessionHistory: SessionHistory[] | undefined,
  sessionId: string,
  currentWorkspace: string
): SessionHistory {
  const targetEntry = sessionHistory?.find((entry) => entry.sessionId === sessionId);
  if (!targetEntry) {
    throw new AppError(`Session ${sessionId} is no longer available to switch to.`, APP_ERROR_CODES.SESSION_NOT_FOUND);
  }

  // Switching assigns state.sessionId exactly as branching does, so it shares the same trap: a
  // target under a stale project directory is invisible to ensureValidSession, which would clear
  // the session and activeDomainFragmentIds without surfacing anything.
  if (targetEntry.workspace !== currentWorkspace) {
    throw new AppError(
      "The agent's workspace changed since that session, so it can no longer be switched to.",
      APP_ERROR_CODES.CONFLICT
    );
  }

  return targetEntry;
}
