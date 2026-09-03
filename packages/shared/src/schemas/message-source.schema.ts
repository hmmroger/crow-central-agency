import { z } from "zod";
import { AgentCommandSchema } from "./agent-command.schema.js";

/** Source type identifiers for messages */
export const MESSAGE_SOURCE_TYPE = {
  USER: "USER",
  LOOP: "LOOP",
  AGENT: "AGENT",
  TASK: "TASK",
  TASK_RESULT: "TASK_RESULT",
  RECOVERY: "RECOVERY",
  NOTIFICATION: "NOTIFICATION",
  DISCORD: "DISCORD",
  COMMAND: "COMMAND",
  INTERNAL: "INTERNAL",
} as const;
export type MessageSourceType = (typeof MESSAGE_SOURCE_TYPE)[keyof typeof MESSAGE_SOURCE_TYPE];

/** Zod schema for message source — identifies who originated a message */
export const MessageSourceSchema = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.USER) }),
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.LOOP) }),
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.AGENT), agentId: z.string() }),
  z.object({
    sourceType: z.literal(MESSAGE_SOURCE_TYPE.TASK),
    taskId: z.string(),
    /** Asks the runtime to run this turn in a fresh session instead of the agent's current one */
    newSession: z.boolean().optional(),
  }),
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.TASK_RESULT), taskId: z.string() }),
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.RECOVERY) }),
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.NOTIFICATION) }),
  z.object({
    sourceType: z.literal(MESSAGE_SOURCE_TYPE.DISCORD),
    channelId: z.string(),
    discordUserId: z.string(),
    discordUsername: z.string(),
    isDm: z.boolean(),
  }),
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.COMMAND), command: AgentCommandSchema }),
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.INTERNAL) }),
]);

export type MessageSource = z.infer<typeof MessageSourceSchema>;
