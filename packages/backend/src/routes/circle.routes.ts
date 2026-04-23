import type { FastifyInstance } from "fastify";
import {
  ENTITY_TYPE,
  CreateAgentCircleInputSchema,
  CreateRelationshipInputSchema,
  UpdateAgentCircleInputSchema,
  type EntityType,
} from "@crow-central-agency/shared";
import type { AgentCircleManager } from "../services/agent-circle-manager.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import { validateAgentIdParam, validateCircleIdParam, validateUuidParam } from "../utils/validation.js";
import { wrapZodError } from "./route-utils.js";

/**
 * Register circle and relationship CRUD routes.
 * Circles group agents; relationships define membership between entities.
 */
export async function registerCircleRoutes(
  server: FastifyInstance,
  circleManager: AgentCircleManager,
  registry: AgentRegistry
) {
  const validateEntity = (entityId: string, entityType: EntityType): void => {
    switch (entityType) {
      case ENTITY_TYPE.AGENT:
        registry.getAgent(entityId);
        break;

      case ENTITY_TYPE.AGENT_CIRCLE:
        circleManager.getCircle(entityId);
        break;
    }
  };

  /** List all circles */
  server.get("/api/circles", async () => {
    const circles = circleManager.getAllCircles();

    return { success: true, data: circles };
  });

  /** Get a single circle by ID */
  server.get<{ Params: { id: string } }>("/api/circles/:id", async (request) => {
    const circleId = validateCircleIdParam(request.params.id);
    const circle = circleManager.getCircle(circleId);

    return { success: true, data: circle };
  });

  /** Create a new circle */
  server.post<{ Body: unknown }>("/api/circles", async (request) => {
    try {
      const input = CreateAgentCircleInputSchema.parse(request.body);
      const circle = await circleManager.createCircle(input);

      return { success: true, data: circle };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Update a circle */
  server.patch<{ Params: { id: string }; Body: unknown }>("/api/circles/:id", async (request) => {
    const circleId = validateCircleIdParam(request.params.id);
    try {
      const input = UpdateAgentCircleInputSchema.parse(request.body);
      const circle = await circleManager.updateCircle(circleId, input);

      return { success: true, data: circle };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Delete a circle (cascades relationships) */
  server.delete<{ Params: { id: string } }>("/api/circles/:id", async (request) => {
    const circleId = validateCircleIdParam(request.params.id);
    await circleManager.deleteCircle(circleId);

    return { success: true, data: { deleted: true } };
  });

  /** Get members of a circle */
  server.get<{ Params: { id: string } }>("/api/circles/:id/members", async (request) => {
    const circleId = validateCircleIdParam(request.params.id);
    const members = circleManager.getCircleMembers(circleId);

    return { success: true, data: members };
  });

  /** Get circles that an agent is a direct member of */
  server.get<{ Params: { id: string } }>("/api/agents/:id/circles", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const circles = circleManager.getCirclesForEntity(agentId, ENTITY_TYPE.AGENT);

    return { success: true, data: circles };
  });

  /** List all relationships */
  server.get("/api/relationships", async () => {
    const relationships = circleManager.getAllRelationships();

    return { success: true, data: relationships };
  });

  /** Create a relationship */
  server.post<{ Body: unknown }>("/api/relationships", async (request) => {
    try {
      const input = CreateRelationshipInputSchema.parse(request.body);
      validateEntity(input.sourceEntityId, input.sourceEntityType);
      validateEntity(input.targetEntityId, input.targetEntityType);

      const relationship = await circleManager.createRelationship(input);

      return { success: true, data: relationship };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Delete a relationship */
  server.delete<{ Params: { id: string } }>("/api/relationships/:id", async (request) => {
    const relationshipId = validateUuidParam(request.params.id, "relationship");
    await circleManager.deleteRelationship(relationshipId);

    return { success: true, data: { deleted: true } };
  });
}
