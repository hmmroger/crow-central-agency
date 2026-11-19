import type {
  AgentThinkingConfig,
  ConfigSelectionMode,
  ConfiguredFeed,
  DiscoveredSkill,
  ReasoningEffort,
  PermissionMode,
  SettingSource,
  ToolMode,
} from "@crow-central-agency/shared";

export type { AgentDetailData } from "../../hooks/queries/use-agent-query.js";

/** A customize-config list's mode plus each mode's own selection, so switching modes loses nothing. */
export interface ConfigSelection {
  mode: ConfigSelectionMode;
  disabled: string[];
  enabled: string[];
}

/** One selectable row in a customize-config dialog; `id` is the value stored in the selection lists. */
export interface ConfigSelectionItem {
  key: string;
  id: string;
  label: string;
  detail?: string;
}

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
  skillSelection: ConfigSelection;
  toolMode: ToolMode;
  selectedTools: string[];
  autoApprovedTools: string[];
  disallowedTools: string[];
  availableTools: string[];
  mcpServerIds: string[];
  sensorIds: string[];
  configuredFeeds: ConfiguredFeed[];
  feedNotificationSessionName: string;
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
