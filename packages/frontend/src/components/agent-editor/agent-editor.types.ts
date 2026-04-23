import type {
  ConfiguredFeed,
  DayOfWeek,
  SchedulerTime,
  PermissionMode,
  SettingSource,
  TimeModeType,
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
  permissionMode: PermissionMode;
  settingSources: SettingSource[];
  toolMode: ToolMode;
  selectedTools: string[];
  autoApprovedTools: string[];
  disallowedTools: string[];
  disallowedToolsEnabled: boolean;
  availableTools: string[];
  mcpServerIds: string[];
  sensorIds: string[];
  configuredFeeds: ConfiguredFeed[];
  loopEnabled: boolean;
  loopDays: DayOfWeek[];
  loopTimeMode: TimeModeType;
  loopTimes: SchedulerTime[];
  loopPrompt: string;
  discordEnabled: boolean;
  discordBotToken: string;
  discordChannelIds: string[];
  discordAllowedUserIds: string[];
  discordRespondToMentionsOnly: boolean;
  discordSyncBotName: boolean;
  excludeClaudeCodeSystemPrompt: boolean;
  agentMd: string;
}
