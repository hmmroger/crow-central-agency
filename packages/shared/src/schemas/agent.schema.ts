import { z } from "zod";
import { PERMISSION_MODE } from "../constants/permission-mode.js";
import { SETTING_SOURCE, DEFAULT_SETTING_SOURCES } from "../constants/setting-source.js";
import { TOOL_MODE } from "../constants/tool-mode.js";
import { LoopConfigSchema } from "./loop.schema.js";
import { CLAUDE_CODE_MODEL_OPTIONS } from "../constants/model-options.js";

/** Default model for new agents — derived from the first entry in CLAUDE_CODE_MODEL_OPTIONS */
export const DEFAULT_MODEL = CLAUDE_CODE_MODEL_OPTIONS[0].value;

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
  name: z.string().min(1).max(64),
  description: z.string().optional(),
  workspace: z.string(),
  persona: z.string().optional(),
  model: z.string().default(DEFAULT_MODEL),
  permissionMode: PermissionModeSchema.default(PERMISSION_MODE.DEFAULT),
  settingSources: z.array(SettingSourceSchema).default([...DEFAULT_SETTING_SOURCES]),
  availableTools: z.array(z.string()).optional(),
  toolConfig: ToolConfigSchema.default({ mode: TOOL_MODE.UNRESTRICTED }),
  loop: LoopConfigSchema.optional(),
  isReplaceSystemPrompt: z.boolean().optional(),
  /** System agents are built-in and cannot be edited, deleted, or persisted */
  isSystemAgent: z.boolean().optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
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
  agentMd: z.string().optional(),
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
  agentMd: z.string().optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type CreateAgentInput = z.infer<typeof CreateAgentInputSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentInputSchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;
