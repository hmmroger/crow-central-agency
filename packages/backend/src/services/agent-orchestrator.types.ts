import type { Query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRuntimeState } from "@crow-central-agency/shared";
import type { EventMap } from "../event-bus/event-bus.types.js";

/** A running agent query with its abort controller */
export interface RunningAgent {
  query: Query;
  abortController: AbortController;
}

/** Factory function that creates an MCP server config for a specific agent */
export type McpServerFactory = (agentId: string) => unknown;

/** Events emitted by the AgentOrchestrator — lifecycle only */
export interface OrchestratorEvents extends EventMap {
  /**
   * Agent status transitioned. No internal subscribers — exposed as a
   * lifecycle event for external consumers (monitoring, future services).
   */
  agentStateChanged: { agentId: string; status: AgentRuntimeState["status"] };
}
