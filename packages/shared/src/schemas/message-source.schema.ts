import { z } from "zod";

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
} as const;
export type MessageSourceType = (typeof MESSAGE_SOURCE_TYPE)[keyof typeof MESSAGE_SOURCE_TYPE];

/** Zod schema for message source — identifies who originated a message */
export const MessageSourceSchema = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.USER) }),
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.LOOP) }),
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.AGENT), agentId: z.string() }),
  z.object({ sourceType: z.literal(MESSAGE_SOURCE_TYPE.TASK), taskId: z.string() }),
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
]);

export type MessageSource = z.infer<typeof MessageSourceSchema>;
