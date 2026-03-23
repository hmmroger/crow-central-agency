import { z } from "zod";

/** Valid roles for session messages */
export const SESSION_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
} as const;

export type SessionRole = (typeof SESSION_ROLE)[keyof typeof SESSION_ROLE];

/**
 * Schema for a single message in an SDK session history
 */
export const SessionMessageSchema = z.object({
  role: z.enum([SESSION_ROLE.USER, SESSION_ROLE.ASSISTANT, SESSION_ROLE.SYSTEM]),
  content: z.string(),
  timestamp: z.iso.datetime({ offset: true }).optional(),
});

export type SessionMessage = z.infer<typeof SessionMessageSchema>;
