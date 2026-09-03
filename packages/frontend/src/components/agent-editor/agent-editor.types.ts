import type {
  AgentThinkingConfig,
  ConfiguredFeed,
  DiscoveredSkill,
  ReasoningEffort,
  PermissionMode,
  SettingSource,
  ToolMode,
} from "@crow-central-agency/shared";

export type { AgentDetailData } from "../../hooks/queries/use-agent-query.js";

/** Form state for the agent editor - all editable fields */
export interface AgentEditorFormState {
  name: string;
  description?: string;
  workspace: string;
  persona?: string;
  model: string;
  effort?: ReasoningEffort;
  thinkingConfig?: AgentThinkingConfig;
  contextAutoCompactionEnabled: boolean;
  contextAutoCompactionThreshold?: number;
  permissionMode: PermissionMode;
  settingSources: SettingSource[];
  disableFileHooks: boolean;
  disabledInstructionSources: string[];
  instructionSources: string[];
  discoveredSkills: DiscoveredSkill[];
  disabledSkills: string[];
  toolMode: ToolMode;
  selectedTools: string[];
  autoApprovedTools: string[];
  disallowedTools: string[];
  availableTools: string[];
  mcpServerIds: string[];
  sensorIds: string[];
  configuredFeeds: ConfiguredFeed[];
  discordEnabled: boolean;
  discordBotToken: string;
  discordChannelIds: string[];
  discordAllowedUserIds: string[];
  discordRespondToMentionsOnly: boolean;
  discordSyncBotName: boolean;
  excludeClaudeCodeSystemPrompt: boolean;
  enableGmailNotification: boolean;
  agentMd: string;
  voiceConfigEnabled: boolean;
  voiceName: string;
  voiceStylePrompt: string;
}
