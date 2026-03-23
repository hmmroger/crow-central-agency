import type { Query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRuntimeState, ServerMessage } from "@crow-central-agency/shared";
import type { EventMap } from "../event-bus/event-bus.types.js";

/** A running agent query with its abort controller */
export interface RunningAgent {
  query: Query;
  abortController: AbortController;
}

/** Factory function that creates an MCP server config for a specific agent */
export type McpServerFactory = (agentId: string) => unknown;

/** Events emitted by the AgentOrchestrator */
export interface OrchestratorEvents extends EventMap {
  /** Agent status changed */
  agentStatus: { agentId: string; status: AgentRuntimeState["status"] };
  /** Agent streamed a WS message (text, activity, result, usage) */
  agentMessage: { agentId: string; message: ServerMessage };
  /** Agent went idle after streaming completed */
  agentIdle: { agentId: string };
  /** Runtime state changed — persist to disk */
  stateChanged: undefined;
}
