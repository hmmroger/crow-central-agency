import type { AgentConfig } from "@crow-central-agency/shared";
import type { EventMap } from "../core/event-bus/event-bus.types.js";

/** Events emitted by the AgentRegistry */
export interface AgentRegistryEvents extends EventMap {
  agentCreated: { agent: AgentConfig };
  agentUpdated: { agent: AgentConfig; previousAgent: AgentConfig; agentMdChanged: boolean };
  agentDeleted: { agentId: string };
}

/** Curated, design-facing view of an agent. Circle names are resolved; mcpServerIds are raw. */
export interface AgentDetails {
  id: string;
  name: string;
  description?: string;
  persona?: string;
  workspace?: string;
  circles: string[];
  mcpServerIds: string[];
  hasAgentMd: boolean;
}
