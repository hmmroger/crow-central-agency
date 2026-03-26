import type {
  AgentConfig,
  DayOfWeek,
  PermissionMode,
  SettingSource,
  TimeMode,
  ToolMode,
} from "@crow-central-agency/shared";

/** Agent data as returned by the detail query (config + optional agentMd) */
export type AgentDetailData = AgentConfig & { agentMd?: string };

/** Form state for the agent editor — all editable fields */
export interface AgentEditorFormState {
  name: string;
  description: string;
  workspace: string;
  persona: string;
  model: string;
  permissionMode: PermissionMode;
  settingSources: SettingSource[];
  toolMode: ToolMode;
  selectedTools: string[];
  autoApprovedTools: string[];
  availableTools: string[];
  loopEnabled: boolean;
  loopDays: DayOfWeek[];
  loopTimeMode: TimeMode;
  loopHour?: number;
  loopMinute?: number;
  loopPrompt: string;
  agentMd: string;
}
