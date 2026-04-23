import type { FastifyInstance } from "fastify";
import {
  ENTITY_TYPE,
  type ApiSuccess,
  type GraphData,
  type GraphEdge,
  type GraphNode,
} from "@crow-central-agency/shared";
import type { AgentCircleManager } from "../services/agent-circle-manager.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { AgentRuntimeManager } from "../services/runtime/agent-runtime-manager.js";

/**
 * Register graph data route.
 * Returns a pre-assembled graph of all agents, circles, and their relationships.
 */
export async function registerGraphRoutes(
  server: FastifyInstance,
  circleManager: AgentCircleManager,
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager
) {
  /** Get the full relationship graph (nodes + edges) */
  server.get<{ Reply: ApiSuccess<GraphData> }>("/api/graph", async () => {
    const agents = registry.getAllAgents(false);
    const circles = circleManager.getAllCircles();
    const relationships = circleManager.getAllRelationships();

    const agentNodes = agents.map(
      (agent): GraphNode => ({
        id: agent.id,
        name: agent.name,
        entityType: ENTITY_TYPE.AGENT,
        isSystemAgent: agent.isSystemAgent,
        isPinned: agent.isPinned,
        status: runtimeManager.getState(agent.id)?.status,
      })
    );

    const circleNodes = circles.map(
      (circle): GraphNode => ({
        id: circle.id,
        name: circle.name,
        entityType: ENTITY_TYPE.AGENT_CIRCLE,
        isSystemCircle: circle.isSystemCircle,
      })
    );

    const graphData: GraphData = {
      nodes: [...agentNodes, ...circleNodes],
      edges: relationships.map(
        (relationship): GraphEdge => ({
          id: relationship.id,
          source: relationship.sourceEntityId,
          target: relationship.targetEntityId,
          relationshipType: relationship.relationshipType,
        })
      ),
    };

    return { success: true, data: graphData };
  });
}
