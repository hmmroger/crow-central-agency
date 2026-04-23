import { CROW_SYSTEM_AGENT_ID, CROW_TASK_DISPATCHER_AGENT_ID } from "@crow-central-agency/shared";
import { randomUUID } from "node:crypto";

/** Known system agent IDs */
export const SYSTEM_AGENT_IDS = new Set([CROW_SYSTEM_AGENT_ID, CROW_TASK_DISPATCHER_AGENT_ID]);

/**
 * Generate a new UUID v4
 */
export function generateId(): string {
  return randomUUID();
}

export function generateRandomString(length: number): string {
  const characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
}

export function isCrowSystemAgent(agentId: string): boolean {
  return SYSTEM_AGENT_IDS.has(agentId);
}
