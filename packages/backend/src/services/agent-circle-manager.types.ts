import type { AgentCircle, Relationship } from "@crow-central-agency/shared";
import type { EventMap } from "../core/event-bus/event-bus.types.js";

/** Events emitted by the AgentCircleManager */
export interface AgentCircleManagerEvents extends EventMap {
  circleCreated: { circle: AgentCircle };
  circleUpdated: { circle: AgentCircle };
  circleDeleted: { circleId: string };
  relationshipCreated: { relationship: Relationship };
  relationshipDeleted: { relationshipId: string };
}
