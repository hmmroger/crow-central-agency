import { z } from "zod";

/** Valid decisions for a permission request */
export const PERMISSION_DECISION = {
  ALLOW: "allow",
  DENY: "deny",
} as const;

export type PermissionDecision = (typeof PERMISSION_DECISION)[keyof typeof PERMISSION_DECISION];

/**
 * Schema for a permission request broadcast to clients
 */
export const PermissionRequestSchema = z.object({
  requestId: z.string(),
  agentId: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.iso.datetime({ offset: true }),
});

/**
 * Schema for a permission response from a client
 */
export const PermissionResponseSchema = z.object({
  requestId: z.string(),
  decision: z.enum([PERMISSION_DECISION.ALLOW, PERMISSION_DECISION.DENY]),
});

export type PermissionRequest = z.infer<typeof PermissionRequestSchema>;
export type PermissionResponseData = z.infer<typeof PermissionResponseSchema>;
