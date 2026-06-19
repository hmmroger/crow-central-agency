import { z } from "zod";

/** Commands an operator can issue to an active provider session. */
export const AGENT_COMMAND = {
  COMPACT: "compact",
} as const;

export type AgentCommand = (typeof AGENT_COMMAND)[keyof typeof AGENT_COMMAND];

export const AgentCommandSchema = z.enum([AGENT_COMMAND.COMPACT]);
