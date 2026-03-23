import { z } from "zod";

/**
 * Schema for streamed text delta from an agent
 */
export const AgentTextMessageSchema = z.object({
  agentId: z.string(),
  text: z.string(),
  timestamp: z.iso.datetime(),
});

/**
 * Schema for tool activity notification from an agent
 */
export const AgentActivityMessageSchema = z.object({
  agentId: z.string(),
  toolName: z.string(),
  description: z.string(),
  timestamp: z.iso.datetime(),
});

/**
 * Schema for agent stream completion result
 */
export const AgentResultMessageSchema = z.object({
  agentId: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
  duration: z.number().optional(),
  timestamp: z.iso.datetime(),
});

/**
 * Schema for agent token usage update
 */
export const AgentUsageMessageSchema = z.object({
  agentId: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cost: z.number(),
  timestamp: z.iso.datetime(),
});

export type AgentTextMessage = z.infer<typeof AgentTextMessageSchema>;
export type AgentActivityMessage = z.infer<typeof AgentActivityMessageSchema>;
export type AgentResultMessage = z.infer<typeof AgentResultMessageSchema>;
export type AgentUsageMessage = z.infer<typeof AgentUsageMessageSchema>;
