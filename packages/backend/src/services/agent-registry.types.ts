import type { AgentConfig } from "@crow-central-agency/shared";
import type { EventMap } from "../core/event-bus/event-bus.types.js";

/** Events emitted by the AgentRegistry */
export interface AgentRegistryEvents extends EventMap {
  agentCreated: { agent: AgentConfig };
  agentUpdated: { agent: AgentConfig };
  agentDeleted: { agentId: string };
}
