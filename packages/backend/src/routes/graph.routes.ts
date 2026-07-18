import type { FastifyInstance } from "fastify";
import {
  ENTITY_TYPE,
  GraphNodePositionSchema,
  type ApiSuccess,
  type GraphData,
  type GraphEdge,
  type GraphNode,
} from "@crow-central-agency/shared";
import { z } from "zod";
import type { AgentCircleManager } from "../services/agent-circle-manager.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { FragmentManager } from "../services/fragment/fragment-manager.js";
import type { RelationshipManager } from "../services/relationship-manager.js";
import type { AgentRuntimeManager } from "../services/runtime/agent-runtime-manager.js";
import { wrapZodError } from "./route-utils.js";

/** Body for saving node layout positions: each node's id plus its x/y */
const SaveGraphPositionsInputSchema = z.object({
  positions: z.array(GraphNodePositionSchema.extend({ id: z.string() })),
});

/**
 * Register graph data routes.
 * Returns a pre-assembled graph of all agents, circles, fragments, and their
 * relationships, and persists user-authored node layout positions.
 */
export async function registerGraphRoutes(
  server: FastifyInstance,
  circleManager: AgentCircleManager,
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager,
  fragmentManager: FragmentManager,
  relationshipManager: RelationshipManager
) {
  /** Get the full relationship graph (nodes + edges) with saved layout positions overlaid */
  server.get<{ Reply: ApiSuccess<GraphData> }>("/api/graph", async () => {
    const agents = registry.getAllAgents(false);
    const circles = circleManager.getAllCircles();
    const relationships = circleManager.getAllRelationships();
    const fragmentCues = await fragmentManager.getAllFragmentCues();
    const positions = relationshipManager.getAllPositions();

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

    const fragmentNodes = fragmentCues.map(
      (fragmentCue): GraphNode => ({
        id: fragmentCue.id,
        name: fragmentCue.cue,
        entityType: ENTITY_TYPE.FRAGMENT,
        kind: fragmentCue.kind,
      })
    );

    const nodes = [...agentNodes, ...circleNodes, ...fragmentNodes].map((node): GraphNode => {
      const position = positions.get(node.id);

      return position ? { ...node, x: position.x, y: position.y } : node;
    });

    const graphData: GraphData = {
      nodes,
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

  /** Save user-authored node layout positions */
  server.patch<{ Body: unknown }>("/api/graph/positions", async (request) => {
    try {
      const { positions } = SaveGraphPositionsInputSchema.parse(request.body);
      await relationshipManager.savePositions(positions.map(({ id, x, y }) => [id, { x, y }] as const));

      return { success: true, data: { saved: positions.length } };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Clear all saved node layout positions (reset to auto-layout) */
  server.delete("/api/graph/positions", async () => {
    await relationshipManager.clearAllPositions();

    return { success: true, data: { cleared: true } };
  });
}
