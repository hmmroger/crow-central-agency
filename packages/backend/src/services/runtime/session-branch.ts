import { AGENT_TYPE, type AgentConfig, type BranchPoint, type SessionHistory } from "@crow-central-agency/shared";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

/**
 * Resolve the session-history entry a branch forks from, rejecting a branch the agent cannot make.
 *
 * Pure and side-effect free: it throws on the first failing condition, so a rejected branch leaves
 * the agent exactly as it was. The agent's IDLE state is gated by the caller, which owns the runner.
 *
 * @param agent the branching agent
 * @param sessionHistory the agent's session ledger
 * @param branchPoint the requested anchor
 * @param currentWorkspace the agent's current resolved workspace
 * @returns The ledger entry to fork from, whose workspace locates the source transcript
 */
export function resolveBranchSource(
  agent: AgentConfig,
  sessionHistory: SessionHistory[] | undefined,
  branchPoint: BranchPoint,
  currentWorkspace: string
): SessionHistory {
  if (agent.type !== AGENT_TYPE.CLAUDE_CODE) {
    throw new AppError("Session branching is only supported for Claude Code agents.", APP_ERROR_CODES.NOT_SUPPORTED);
  }

  if (agent.persistSession === false) {
    throw new AppError(
      "This agent does not persist sessions, so there is nothing to branch from.",
      APP_ERROR_CODES.VALIDATION
    );
  }

  const sourceEntry = sessionHistory?.find((entry) => entry.sessionId === branchPoint.sessionId);
  if (!sourceEntry) {
    throw new AppError(
      `Session ${branchPoint.sessionId} is no longer available to branch from.`,
      APP_ERROR_CODES.SESSION_NOT_FOUND
    );
  }

  // Claude sessions are keyed by project directory: the fork lands under the source session's
  // workspace, while the turn that follows runs under the agent's current one. On a divergence
  // ensureValidSession would find nothing and silently clear the session and its active domains,
  // so the workspace change is reported here instead.
  if (sourceEntry.workspace !== currentWorkspace) {
    throw new AppError(
      "The agent's workspace changed since that session, so it can no longer be branched from.",
      APP_ERROR_CODES.CONFLICT
    );
  }

  return sourceEntry;
}
