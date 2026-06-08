import type { EventMap } from "../core/event-bus/event-bus.types.js";
import type { PermissionResult } from "../services/runtime/permission-handler.types.js";
import type { AgentConfig, AgentStatus } from "@crow-central-agency/shared";
import type { MessageSource } from "../services/message-queue-manager.types.js";
import type { CrowMcpServerConfig } from "../mcp/crow-mcp-manager.types.js";

export interface AgentRunnerEvents extends EventMap {
  agentStatusChanged: { agentId: string; status: AgentStatus; messageSource: MessageSource };
}

export interface AgentRunQueryRequest {
  message: string;
  sessionId?: string;
  cwd: string;
  agentConfig: AgentConfig;
  systemPrompt: string;
  timezone?: string;
  serverConfigs: CrowMcpServerConfig[];
  internalMcpPrefixes: string[];
  /** Per-turn cancellation handle, created and owned by the base runner. */
  abortController: AbortController;
}

export type OOBStreamEventCallback = (streamEvent: AgentStreamActivityEvent | AgentStreamToolUseEvent) => void;

export type PermissionRequestCallback = (
  agentId: string,
  toolName: string,
  input: Record<string, unknown>,
  toolUseId: string,
  decisionReason?: string
) => Promise<PermissionResult>;

export const AGENT_STREAM_EVENT_TYPE = {
  INIT: "INIT",
  TOOLS_DISCOVERED: "TOOLS_DISCOVERED",
  DONE: "DONE",
  ERROR: "ERROR",
  ABORTED: "ABORTED",

  CONTENT: "CONTENT",
  THINKING: "THINKING",

  STATUS: "STATUS",

  RATE_LIMIT_INFO: "RATE_LIMIT_INFO",

  ACTIVITY: "ACTIVITY",
  TOOL_USE: "TOOL_USE",
  TOOL_USE_PROGRESS: "TOOL_USE_PROGRESS",

  USAGE: "USAGE",
  MESSAGE_DONE: "MESSAGE_DONE",
} as const;
export type AgentStreamEventType = (typeof AGENT_STREAM_EVENT_TYPE)[keyof typeof AGENT_STREAM_EVENT_TYPE];

export type AgentStreamEvent =
  | AgentStreamAbortedEvent
  | AgentStreamErrorEvent
  | AgentStreamInitEvent
  | AgentStreamToolsDiscoveredEvent
  | AgentStreamContentEvent
  | AgentStreamThinkingEvent
  | AgentStreamStatusEvent
  | AgentStreamActivityEvent
  | AgentStreamToolUseEvent
  | AgentStreamToolUseProgressEvent
  | AgentStreamMessageDoneEvent
  | AgentStreamUsageEvent
  | AgentStreamDoneEvent
  | AgentStreamRateLimitInfoEvent;

export interface AgentStreamEventCommon {
  type: AgentStreamEventType;
  agentId: string;
  sessionId: string;
}

export interface AgentStreamAbortedEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["ABORTED"];
}

export interface AgentStreamErrorEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["ERROR"];
  error: string;
}

export interface AgentStreamInitEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["INIT"];
}

export interface AgentStreamToolsDiscoveredEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["TOOLS_DISCOVERED"];
  discoveredTools: string[];
}

export interface AgentStreamContentEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["CONTENT"];
  content: string;
}

export interface AgentStreamThinkingEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["THINKING"];
  reasoningContent: string;
}

export interface AgentStreamStatusEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["STATUS"];
  status: AgentStatus;
}

export interface AgentStreamActivityEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["ACTIVITY"];
  activity: string;
  description: string;
  subAgentId?: string;
}

export interface AgentStreamToolUseEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["TOOL_USE"];
  toolName: string;
  description: string;
  input: unknown;
  subAgentId?: string;
}

export interface AgentStreamToolUseProgressEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["TOOL_USE_PROGRESS"];
  toolName: string;
  elapsedTimeSeconds: number;
}

export interface AgentStreamMessageDoneEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["MESSAGE_DONE"];
  messageId: string;
  message: unknown; // CLAUDE_CODE: SessionMessage; GITHUB_COPILOT: SessionEvent
}

export interface AgentStreamUsageEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["USAGE"];
  totalInputTokens: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AgentStreamDoneEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["DONE"];
  isSuccess: boolean;
  doneType: string;
  durationMs: number;
  usage?: AgentStreamUsage;
}

export interface AgentStreamRateLimitInfoEvent extends AgentStreamEventCommon {
  type: (typeof AGENT_STREAM_EVENT_TYPE)["RATE_LIMIT_INFO"];
  rateLimitStatus: "allowed" | "allowed_warning" | "rejected";
  resetsAt?: number;
  rateLimitType?: "five_hour" | "seven_day" | "seven_day_opus" | "seven_day_sonnet" | "overage";
  utilization?: number;
}

export interface AgentStreamUsage {
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  contextUsed?: number;
  contextTotal?: number;
}
