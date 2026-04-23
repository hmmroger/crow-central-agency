import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages.mjs";
import type { UUID } from "crypto";
import type { EventMap } from "../core/event-bus/event-bus.types.js";
import type { PermissionResult } from "../services/runtime/permission-handler.types.js";
import type { AgentStatus } from "@crow-central-agency/shared";
import type { MessageSource } from "../services/message-queue-manager.types.js";

export interface AgentRunnerEvents extends EventMap {
  agentStatusChanged: { agentId: string; status: AgentStatus; messageSource: MessageSource };
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

  // single assistant message completed
  MESSAGE_DONE: "MESSAGE_DONE",
} as const;
export type AgentStreamEventType = (typeof AGENT_STREAM_EVENT_TYPE)[keyof typeof AGENT_STREAM_EVENT_TYPE];

export type AgentStreamEvent =
  | AgentStreamAbortedEvent
  | AgentStreamErrorEvent
  | AgentStreamInitEvent
  | AgentStreamContentEvent
  | AgentStreamThinkingEvent
  | AgentStreamStatusEvent
  | AgentStreamActivityEvent
  | AgentStreamToolUseEvent
  | AgentStreamToolUseProgressEvent
  | AgentStreamMessageDoneEvent
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
  discoveredTools?: string[];
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
  messageId: UUID;
  message: BetaMessage;
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
