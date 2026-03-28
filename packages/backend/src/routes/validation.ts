import { AgentIdSchema } from "@crow-central-agency/shared";
import { SYSTEM_AGENT_IDS } from "../services/agent-registry.js";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";

/** Validate that a route param is a valid UUID or a known system agent ID */
export function validateAgentIdParam(id: string): string {
  if (SYSTEM_AGENT_IDS.has(id)) {
    return id;
  }

  const result = AgentIdSchema.safeParse(id);
  if (!result.success) {
    throw new AppError("Invalid agent id", APP_ERROR_CODES.VALIDATION);
  }

  return result.data;
}
