import { z } from "zod";
import { DiscordConfigSchema } from "./discord-config.schema.js";
import { DayOfWeekSchema, SchedulerTimeSchema, TIME_MODE, TimeModeSchema } from "./scheduler.schema.js";

export const CLAUDE_MODELS = {
  HAIKU: "claude-haiku-4-5",
  SONNET: "claude-sonnet-4-6",
  SONNET_4_5: "claude-sonnet-4-5",
  OPUS: "claude-opus-4-8",
  OPUS_4_7: "claude-opus-4-7",
  OPUS_4_6: "claude-opus-4-6",
  OPUS_4_5: "claude-opus-4-5",
  FABLE: "claude-fable-5",
} as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];

export const GITHUB_COPILOT_MODELS = {
  AUTO: "auto",
  HAIKU: "claude-haiku-4.5",
  SONNET: "claude-sonnet-4.6",
  OPUS: "claude-opus-4.8",
  GPT_5_5: "gpt-5.5",
  GPT_5_4: "gpt-5.4",
  GPT_5_3_CODEX: "gpt-5.3-codex",
  GPT_5_4_MINI: "gpt-5.4-mini",
  GPT_5_MINI: "gpt-5-mini",
} as const;

export type GitHubCopilotModel = (typeof GITHUB_COPILOT_MODELS)[keyof typeof GITHUB_COPILOT_MODELS];

export const REASONING_EFFORT = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  XHIGH: "xhigh",
  MAX: "max",
} as const;

export type ReasoningEffort = (typeof REASONING_EFFORT)[keyof typeof REASONING_EFFORT];

export const ReasoningEffortSchema = z.enum([
  REASONING_EFFORT.LOW,
  REASONING_EFFORT.MEDIUM,
  REASONING_EFFORT.HIGH,
  REASONING_EFFORT.XHIGH,
  REASONING_EFFORT.MAX,
]);

/** A selectable agent model, surfaced to the editor's model picker. */
export const ModelOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  /** Reasoning effort levels the model supports; omitted when the model has no effort control. */
  supportedEfforts: z.array(ReasoningEffortSchema).optional(),
});

export type ModelOption = z.infer<typeof ModelOptionSchema>;

export const CLAUDE_CODE_MODEL_OPTIONS: readonly ModelOption[] = [
  {
    value: CLAUDE_MODELS.SONNET,
    label: "Claude Sonnet 4.6",
    supportedEfforts: [REASONING_EFFORT.LOW, REASONING_EFFORT.MEDIUM, REASONING_EFFORT.HIGH, REASONING_EFFORT.MAX],
  },
  {
    value: CLAUDE_MODELS.OPUS,
    label: "Claude Opus 4.8",
    supportedEfforts: [
      REASONING_EFFORT.LOW,
      REASONING_EFFORT.MEDIUM,
      REASONING_EFFORT.HIGH,
      REASONING_EFFORT.XHIGH,
      REASONING_EFFORT.MAX,
    ],
  },
  {
    value: CLAUDE_MODELS.OPUS_4_7,
    label: "Claude Opus 4.7",
    supportedEfforts: [
      REASONING_EFFORT.LOW,
      REASONING_EFFORT.MEDIUM,
      REASONING_EFFORT.HIGH,
      REASONING_EFFORT.XHIGH,
      REASONING_EFFORT.MAX,
    ],
  },
  { value: CLAUDE_MODELS.HAIKU, label: "Claude Haiku 4.5" },
  {
    value: CLAUDE_MODELS.FABLE,
    label: "Claude Fable 5",
    supportedEfforts: [
      REASONING_EFFORT.LOW,
      REASONING_EFFORT.MEDIUM,
      REASONING_EFFORT.HIGH,
      REASONING_EFFORT.XHIGH,
      REASONING_EFFORT.MAX,
    ],
  },
];

/** Default model for new agents */
export const CLAUDE_DEFAULT_MODEL = CLAUDE_MODELS.SONNET;
export const COPILOT_DEFAULT_MODEL = GITHUB_COPILOT_MODELS.AUTO;

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
 * Default builtin tool catalog for Claude Code agents.
 */
export const DEFAULT_CLAUDE_CODE_AVAILABLE_TOOLS = [
  "AskUserQuestion",
  "Bash",
  "CronCreate",
  "CronDelete",
  "CronList",
  "Edit",
  "EnterPlanMode",
  "EnterWorktree",
  "ExitPlanMode",
  "ExitWorktree",
  "Glob",
  "Grep",
  "LSP",
  "Monitor",
  "NotebookEdit",
  "PowerShell",
  "PushNotification",
  "Read",
  "RemoteTrigger",
  "ScheduleWakeup",
  "Skill",
  "Task",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskOutput",
  "TaskStop",
  "TaskUpdate",
  "ToolSearch",
  "WebFetch",
  "WebSearch",
  "Workflow",
  "Write",
] as const;

/**
 * Default builtin tool catalog for GitHub Copilot agents.
 */
export const DEFAULT_GITHUB_COPILOT_AVAILABLE_TOOLS = [
  "bash",
  "write_bash",
  "read_bash",
  "stop_bash",
  "list_bash",
  "view",
  "create",
  "edit",
  "web_fetch",
  "report_intent",
  "fetch_copilot_cli_documentation",
  "skill",
  "ask_user",
  "grep",
  "glob",
  "task",
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
  GITHUB_COPILOT: "GITHUB_COPILOT",
} as const;

export type AgentType = (typeof AGENT_TYPE)[keyof typeof AGENT_TYPE];

export const AgentTypeSchema = z.enum([AGENT_TYPE.CLAUDE_CODE, AGENT_TYPE.GITHUB_COPILOT]);

/** Default agent type applied when none is specified. */
export const DEFAULT_AGENT_TYPE = AGENT_TYPE.CLAUDE_CODE;

/** Default builtin tool catalog per provider, used to seed new agents and the editor's tool picker. */
export const DEFAULT_AVAILABLE_TOOLS_BY_TYPE: Record<AgentType, readonly string[]> = {
  [AGENT_TYPE.CLAUDE_CODE]: DEFAULT_CLAUDE_CODE_AVAILABLE_TOOLS,
  [AGENT_TYPE.GITHUB_COPILOT]: DEFAULT_GITHUB_COPILOT_AVAILABLE_TOOLS,
};

export const AgentIdSchema = z.uuid();

/** Maximum length of an agent name, enforced on the create/update input path. */
export const AGENT_NAME_MAX_LENGTH = 50;

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

export const DiscoveredSkillSchema = z.object({
  name: z.string(),
  source: z.string(),
});

export type DiscoveredSkill = z.infer<typeof DiscoveredSkillSchema>;

export const SettingSourceConfigSchema = z.object({
  disableFileHooks: z.boolean().optional(),
  instructionSources: z.array(z.string()).optional(),
  disabledInstructionSources: z.array(z.string()).optional(),
  discoveredSkills: z.array(DiscoveredSkillSchema).optional(),
  disabledSkills: z.array(z.string()).optional(),
});

export const SettingSourceConfigInputSchema = SettingSourceConfigSchema.omit({
  instructionSources: true,
  discoveredSkills: true,
});

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

export const AgentVoiceConfigSchema = z.object({
  voiceName: z.string().optional(),
  stylePrompt: z.string().optional(),
});

export type AgentVoiceConfig = z.infer<typeof AgentVoiceConfigSchema>;

/**
 * Full agent configuration - persisted to disk in agents.json
 */
export const AgentConfigSchema = z.object({
  id: AgentIdSchema,
  type: AgentTypeSchema.default(DEFAULT_AGENT_TYPE),
  name: z.string().min(1).max(64),
  description: z.string().optional(),
  workspace: z.string().min(1).optional(),
  persona: z.string().optional(),
  model: z.string().default(CLAUDE_DEFAULT_MODEL),
  effort: ReasoningEffortSchema.optional(),
  permissionMode: PermissionModeSchema.default(PERMISSION_MODE.DEFAULT),
  settingSources: z.array(SettingSourceSchema).default([...DEFAULT_SETTING_SOURCES]),
  settingSourceConfig: SettingSourceConfigSchema.optional(),
  availableTools: z.array(z.string()).optional(),
  toolConfig: ToolConfigSchema.default({ mode: TOOL_MODE.UNRESTRICTED }),
  agentVoiceConfig: AgentVoiceConfigSchema.optional(),
  /** IDs of user-configured MCP servers enabled for this agent */
  mcpServerIds: z.array(z.string()).optional(),
  configuredFeeds: z.array(ConfiguredFeedSchema).optional(),
  sensorIds: z.array(z.string()).optional(),
  loop: LoopConfigSchema.optional(),
  discordConfig: DiscordConfigSchema.optional(),
  persistSession: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  excludeClaudeCodeSystemPrompt: z.boolean().optional(),
  enableGmailNotification: z.boolean().optional(),
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
  type: AgentTypeSchema.default(DEFAULT_AGENT_TYPE),
  name: z.string().min(1).max(AGENT_NAME_MAX_LENGTH),
  description: z.string().optional(),
  workspace: z.string().min(1).optional(),
  persona: z.string().optional(),
  model: z.string().optional(),
  effort: ReasoningEffortSchema.optional(),
  permissionMode: PermissionModeSchema.optional(),
  settingSources: z.array(SettingSourceSchema).optional(),
  settingSourceConfig: SettingSourceConfigInputSchema.optional(),
  toolConfig: ToolConfigSchema.optional(),
  agentVoiceConfig: AgentVoiceConfigSchema.optional(),
  mcpServerIds: z.array(z.string()).optional(),
  configuredFeeds: z.array(ConfiguredFeedSchema).optional(),
  sensorIds: z.array(z.string()).optional(),
  loop: LoopConfigSchema.optional(),
  discordConfig: DiscordConfigSchema.optional(),
  excludeClaudeCodeSystemPrompt: z.boolean().optional(),
  enableGmailNotification: z.boolean().optional(),
  agentMd: z.string().optional(),
});

export type CreateAgentInput = z.infer<typeof CreateAgentInputSchema>;

/**
 * Input for updating an existing agent - all fields optional
 */
export const UpdateAgentInputSchema = z.object({
  name: z.string().min(1).max(AGENT_NAME_MAX_LENGTH).optional(),
  description: z.string().optional(),
  workspace: z.string().optional(),
  persona: z.string().optional(),
  model: z.string().optional(),
  // null explicitly clears the effort (back to provider default); undefined leaves it unchanged.
  effort: ReasoningEffortSchema.nullish(),
  permissionMode: PermissionModeSchema.optional(),
  settingSources: z.array(SettingSourceSchema).optional(),
  settingSourceConfig: SettingSourceConfigInputSchema.optional(),
  toolConfig: ToolConfigSchema.optional(),
  agentVoiceConfig: AgentVoiceConfigSchema.optional(),
  mcpServerIds: z.array(z.string()).optional(),
  configuredFeeds: z.array(ConfiguredFeedSchema).optional(),
  sensorIds: z.array(z.string()).optional(),
  loop: LoopConfigSchema.optional(),
  discordConfig: DiscordConfigSchema.optional(),
  isPinned: z.boolean().optional(),
  excludeClaudeCodeSystemPrompt: z.boolean().optional(),
  enableGmailNotification: z.boolean().optional(),
  agentMd: z.string().optional(),
});

export type UpdateAgentInput = z.infer<typeof UpdateAgentInputSchema>;

export const AgentConfigTemplateSchema = AgentConfigSchema.pick({
  type: true,
  description: true,
  workspace: true,
  persona: true,
  model: true,
  effort: true,
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
