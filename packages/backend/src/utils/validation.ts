import { z } from "zod/v4";
import { AgentIdSchema, BASE_CIRCLE_ID } from "@crow-central-agency/shared";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { SYSTEM_AGENT_IDS } from "./id-utils.js";

/** Well-known system circle IDs that are not UUIDs */
const SYSTEM_CIRCLE_IDS = new Set([BASE_CIRCLE_ID]);

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

/** Validate that a route param is a valid UUID or a known system circle ID */
export function validateCircleIdParam(id: string): string {
  if (SYSTEM_CIRCLE_IDS.has(id)) {
    return id;
  }

  const result = z.uuid().safeParse(id);
  if (!result.success) {
    throw new AppError("Invalid circle id", APP_ERROR_CODES.VALIDATION);
  }

  return result.data;
}

/** Validate that a route param is a valid UUID */
export function validateUuidParam(id: string, label: string): string {
  const result = z.uuid().safeParse(id);
  if (!result.success) {
    throw new AppError(`Invalid ${label} id`, APP_ERROR_CODES.VALIDATION);
  }

  return result.data;
}
