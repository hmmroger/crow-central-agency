import { z } from "zod";
import { PERMISSION_MODE } from "../constants/permission-mode.js";
import { SETTING_SOURCE } from "../constants/setting-source.js";
import { TOOL_MODE } from "../constants/tool-mode.js";
import { TIME_MODE } from "../constants/time-mode.js";
import { DAY_OF_WEEK } from "../constants/day-of-week.js";
import { LoopConfigSchema } from "./loop.schema.js";

/** Default model for new agents */
export const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Zod schema for PermissionMode values */
export const PermissionModeSchema = z.enum([
  PERMISSION_MODE.DEFAULT,
  PERMISSION_MODE.ACCEPT_EDITS,
  PERMISSION_MODE.BYPASS_PERMISSIONS,
  PERMISSION_MODE.PLAN,
  PERMISSION_MODE.DONT_ASK,
]);

/** Zod schema for SettingSource values */
export const SettingSourceSchema = z.enum([SETTING_SOURCE.USER, SETTING_SOURCE.PROJECT, SETTING_SOURCE.LOCAL]);

/** Zod schema for DayOfWeek values */
export const DayOfWeekSchema = z.enum([
  DAY_OF_WEEK.MONDAY,
  DAY_OF_WEEK.TUESDAY,
  DAY_OF_WEEK.WEDNESDAY,
  DAY_OF_WEEK.THURSDAY,
  DAY_OF_WEEK.FRIDAY,
  DAY_OF_WEEK.SATURDAY,
  DAY_OF_WEEK.SUNDAY,
]);

/** Zod schema for TimeMode values */
export const TimeModeSchema = z.enum([TIME_MODE.AT, TIME_MODE.EVERY]);

/**
 * Tool configuration for agent
 */
export const ToolConfigSchema = z.object({
  mode: z.enum([TOOL_MODE.UNRESTRICTED, TOOL_MODE.RESTRICTED]).default(TOOL_MODE.UNRESTRICTED),
  tools: z.array(z.string()).optional(),
  autoApprovedTools: z.array(z.string()).optional(),
});

/**
 * Full agent configuration — persisted to disk in agents.json
 */
export const AgentConfigSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
  description: z.string().default(""),
  workspace: z.string(),
  persona: z.string().default(""),
  model: z.string().default(DEFAULT_MODEL),
  permissionMode: PermissionModeSchema.default(PERMISSION_MODE.DEFAULT),
  settingSources: z.array(SettingSourceSchema).default([SETTING_SOURCE.USER, SETTING_SOURCE.PROJECT]),
  availableTools: z.array(z.string()).optional(),
  toolConfig: ToolConfigSchema.default({ mode: TOOL_MODE.UNRESTRICTED }),
  loop: LoopConfigSchema.default({ enabled: false, daysOfWeek: [], timeMode: TIME_MODE.EVERY, prompt: "" }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Input for creating a new agent — only required fields
 */
export const CreateAgentInputSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  workspace: z.string(),
  persona: z.string().optional(),
  model: z.string().optional(),
  permissionMode: PermissionModeSchema.optional(),
  settingSources: z.array(SettingSourceSchema).optional(),
  toolConfig: ToolConfigSchema.optional(),
  loop: LoopConfigSchema.optional(),
});

/**
 * Input for updating an existing agent — all fields optional
 */
export const UpdateAgentInputSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  workspace: z.string().optional(),
  persona: z.string().optional(),
  model: z.string().optional(),
  permissionMode: PermissionModeSchema.optional(),
  settingSources: z.array(SettingSourceSchema).optional(),
  availableTools: z.array(z.string()).optional(),
  toolConfig: ToolConfigSchema.optional(),
  loop: LoopConfigSchema.optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type CreateAgentInput = z.infer<typeof CreateAgentInputSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentInputSchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;
