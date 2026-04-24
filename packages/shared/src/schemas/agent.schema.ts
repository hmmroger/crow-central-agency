import { z } from "zod";
import { DiscordConfigSchema } from "./discord-config.schema.js";
import { DayOfWeekSchema, SchedulerTimeSchema, TIME_MODE, TimeModeSchema } from "./scheduler.schema.js";

export const CLAUDE_MODELS = {
  HAIKU: "claude-haiku-4-5",
  SONNET: "claude-sonnet-4-6",
  SONNET_4_5: "claude-sonnet-4-5",
  OPUS: "claude-opus-4-7",
  OPUS_4_6: "claude-opus-4-6",
  OPUS_4_5: "claude-opus-4-5",
} as const;

export type AgentModels = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];

export const CLAUDE_CODE_MODEL_OPTIONS = [
  { value: CLAUDE_MODELS.SONNET, label: "Claude Sonnet 4.6" },
  { value: CLAUDE_MODELS.OPUS, label: "Claude Opus 4.7" },
  { value: CLAUDE_MODELS.HAIKU, label: "Claude Haiku 4.5" },
] as const;

/** Default model for new agents */
export const DEFAULT_MODEL = CLAUDE_MODELS.SONNET;

/**
 * Tool configuration modes for agent tool availability.
 */
export const TOOL_MODE = {
  /** All tools available - pass undefined to SDK */
  UNRESTRICTED: "unrestricted",
  /** User-selected tool subset - pass explicit string[] to SDK */
  RESTRICTED: "restricted",
} as const;

export type ToolMode = (typeof TOOL_MODE)[keyof typeof TOOL_MODE];

/** The SDK tool name used to launch a subagent */
export const SUBAGENT_TOOL_NAME = "Agent" as const;

/**
 * Default available tools for new agent creation.
 */
export const DEFAULT_AVAILABLE_TOOLS = [
  "AskUserQuestion",
  "Bash",
  "Glob",
  "Grep",
  "Read",
  "Edit",
  "Write",
  "WebFetch",
  "WebSearch",
  "Task",
  "TaskOutput",
  "TaskStop",
  "TodoWrite",
  "NotebookEdit",
  "Skill",
  "EnterPlanMode",
  "ExitPlanMode",
  "EnterWorktree",
  "ExitWorktree",
  "CronCreate",
  "CronDelete",
  "CronList",
  "ToolSearch",
] as const;

/**
 * Setting sources matching SDK SettingSource type.
 * Controls which SDK configuration sources are included in agent queries.
 */
export const SETTING_SOURCE = {
  USER: "user",
  PROJECT: "project",
  LOCAL: "local",
} as const;

export type SettingSource = (typeof SETTING_SOURCE)[keyof typeof SETTING_SOURCE];

/** Default setting sources for new agent creation */
export const DEFAULT_SETTING_SOURCES: SettingSource[] = [
  SETTING_SOURCE.USER,
  SETTING_SOURCE.PROJECT,
  SETTING_SOURCE.LOCAL,
];

/**
 * Permission modes matching SDK PermissionMode type.
 * Controls how tool permissions are handled during agent execution.
 */
export const PERMISSION_MODE = {
  DEFAULT: "default",
  ACCEPT_EDITS: "acceptEdits",
  BYPASS_PERMISSIONS: "bypassPermissions",
  PLAN: "plan",
  DONT_ASK: "dontAsk",
} as const;

export type PermissionMode = (typeof PERMISSION_MODE)[keyof typeof PERMISSION_MODE];

export const AGENT_TYPE = {
  CLAUDE_CODE: "CLAUDE_CODE",
} as const;

export type AgentType = (typeof AGENT_TYPE)[keyof typeof AGENT_TYPE];

export const AgentIdSchema = z.uuid();

/** Maximum number of time entries allowed in a loop config */
export const MAX_LOOP_TIMES = 6;

/** Loop configuration */
export const LoopConfigSchema = z.object({
  enabled: z.boolean().default(false),
  daysOfWeek: z.array(DayOfWeekSchema).default([]),
  timeMode: TimeModeSchema.default(TIME_MODE.EVERY),
  times: z.array(SchedulerTimeSchema).min(1).max(MAX_LOOP_TIMES).default([{}]),
  prompt: z.string(),
});

export type LoopConfig = z.infer<typeof LoopConfigSchema>;

export const ConfiguredFeedSchema = z.object({
  feedId: z.string(),
  isNotify: z.boolean().optional(),
});

export type ConfiguredFeed = z.infer<typeof ConfiguredFeedSchema>;

export const PermissionModeSchema = z.enum([
  PERMISSION_MODE.DEFAULT,
  PERMISSION_MODE.ACCEPT_EDITS,
  PERMISSION_MODE.BYPASS_PERMISSIONS,
  PERMISSION_MODE.PLAN,
  PERMISSION_MODE.DONT_ASK,
]);

export const SettingSourceSchema = z.enum([SETTING_SOURCE.USER, SETTING_SOURCE.PROJECT, SETTING_SOURCE.LOCAL]);

/**
 * Tool configuration for agent
 */
export const ToolConfigSchema = z.object({
  mode: z.enum([TOOL_MODE.UNRESTRICTED, TOOL_MODE.RESTRICTED]).default(TOOL_MODE.UNRESTRICTED),
  tools: z.array(z.string()).optional(),
  autoApprovedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
});

export type ToolConfig = z.infer<typeof ToolConfigSchema>;

/**
 * Full agent configuration - persisted to disk in agents.json
 */
export const AgentConfigSchema = z.object({
  id: AgentIdSchema,
  type: z.enum([AGENT_TYPE.CLAUDE_CODE]).default(AGENT_TYPE.CLAUDE_CODE),
  name: z.string().min(1).max(64),
  description: z.string().optional(),
  workspace: z.string().min(1).optional(),
  persona: z.string().optional(),
  model: z.string().default(DEFAULT_MODEL),
  permissionMode: PermissionModeSchema.default(PERMISSION_MODE.DEFAULT),
  settingSources: z.array(SettingSourceSchema).default([...DEFAULT_SETTING_SOURCES]),
  availableTools: z.array(z.string()).optional(),
  toolConfig: ToolConfigSchema.default({ mode: TOOL_MODE.UNRESTRICTED }),
  /** IDs of user-configured MCP servers enabled for this agent */
  mcpServerIds: z.array(z.string()).optional(),
  configuredFeeds: z.array(ConfiguredFeedSchema).optional(),
  sensorIds: z.array(z.string()).optional(),
  loop: LoopConfigSchema.optional(),
  discordConfig: DiscordConfigSchema.optional(),
  persistSession: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  excludeClaudeCodeSystemPrompt: z.boolean().optional(),
  /** System agents are built-in and cannot be edited, deleted, or persisted */
  isSystemAgent: z.boolean().optional(),
  /** Background agents does not show up in the list */
  isBackgroundAgent: z.boolean().optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Input for creating a new agent - only required fields
 */
export const CreateAgentInputSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  workspace: z.string().min(1).optional(),
  persona: z.string().optional(),
  model: z.string().optional(),
  permissionMode: PermissionModeSchema.optional(),
  settingSources: z.array(SettingSourceSchema).optional(),
  toolConfig: ToolConfigSchema.optional(),
  mcpServerIds: z.array(z.string()).optional(),
  configuredFeeds: z.array(ConfiguredFeedSchema).optional(),
  sensorIds: z.array(z.string()).optional(),
  loop: LoopConfigSchema.optional(),
  discordConfig: DiscordConfigSchema.optional(),
  excludeClaudeCodeSystemPrompt: z.boolean().optional(),
  agentMd: z.string().optional(),
});

export type CreateAgentInput = z.infer<typeof CreateAgentInputSchema>;

/**
 * Input for updating an existing agent - all fields optional
 */
export const UpdateAgentInputSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  workspace: z.string().optional(),
  persona: z.string().optional(),
  model: z.string().optional(),
  permissionMode: PermissionModeSchema.optional(),
  settingSources: z.array(SettingSourceSchema).optional(),
  toolConfig: ToolConfigSchema.optional(),
  mcpServerIds: z.array(z.string()).optional(),
  configuredFeeds: z.array(ConfiguredFeedSchema).optional(),
  sensorIds: z.array(z.string()).optional(),
  loop: LoopConfigSchema.optional(),
  discordConfig: DiscordConfigSchema.optional(),
  isPinned: z.boolean().optional(),
  excludeClaudeCodeSystemPrompt: z.boolean().optional(),
  agentMd: z.string().optional(),
});

export type UpdateAgentInput = z.infer<typeof UpdateAgentInputSchema>;

export const AgentConfigTemplateSchema = AgentConfigSchema.pick({
  description: true,
  workspace: true,
  persona: true,
  model: true,
  permissionMode: true,
  settingSources: true,
  availableTools: true,
  toolConfig: true,
  mcpServerIds: true,
  configuredFeeds: true,
  sensorIds: true,
  loop: true,
}).extend({
  templateId: z.uuid(),
  templateName: z.string().min(1).max(64),
  agentMd: z.string().optional(),
});

export type AgentConfigTemplate = z.infer<typeof AgentConfigTemplateSchema>;
