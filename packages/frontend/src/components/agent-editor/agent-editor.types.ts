import type { DayOfWeek, PermissionMode, SettingSource, TimeMode, ToolMode } from "@crow-central-agency/shared";

export type { AgentDetailData } from "../../hooks/use-agent-query.js";

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
