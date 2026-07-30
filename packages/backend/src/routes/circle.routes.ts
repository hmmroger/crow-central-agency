import type { FastifyInstance } from "fastify";
import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  CreateAgentCircleInputSchema,
  CreateRelationshipInputSchema,
  UpdateAgentCircleInputSchema,
  type EntityType,
} from "@crow-central-agency/shared";
import type { AgentCircleManager } from "../services/agent-circle-manager.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { FragmentManager } from "../services/fragment/fragment-manager.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { validateAgentIdParam, validateCircleIdParam, validateUuidParam } from "../utils/validation.js";
import { wrapZodError } from "./route-utils.js";

/**
 * Register circle and relationship CRUD routes.
 * Circles group agents; relationships define membership between entities and,
 * for fragments, the ASSOCIATION/LINK edges that anchor and connect them.
 */
export async function registerCircleRoutes(
  server: FastifyInstance,
  circleManager: AgentCircleManager,
  registry: AgentRegistry,
  fragmentManager: FragmentManager
) {
  const validateEntity = (entityId: string, entityType: EntityType): void => {
    switch (entityType) {
      case ENTITY_TYPE.AGENT:
        registry.getAgent(entityId);
        break;

      case ENTITY_TYPE.AGENT_CIRCLE:
        circleManager.getCircle(entityId);
        break;

      case ENTITY_TYPE.FRAGMENT:
        throw new AppError(`Entity type ${entityType} is not supported by this route`, APP_ERROR_CODES.VALIDATION);
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

  /** Create a relationship of any type, dispatching kind rules to the owning manager */
  server.post<{ Body: unknown }>("/api/relationships", async (request) => {
    try {
      const input = CreateRelationshipInputSchema.parse(request.body);

      switch (input.relationshipType) {
        case RELATIONSHIP_TYPE.MEMBERSHIP: {
          validateEntity(input.sourceEntityId, input.sourceEntityType);
          validateEntity(input.targetEntityId, input.targetEntityType);
          const relationship = await circleManager.createRelationship(input);

          return { success: true, data: relationship };
        }

        case RELATIONSHIP_TYPE.ASSOCIATION: {
          if (input.sourceEntityType !== ENTITY_TYPE.AGENT || input.targetEntityType !== ENTITY_TYPE.FRAGMENT) {
            throw new AppError(
              "ASSOCIATION requires an AGENT source and a FRAGMENT target",
              APP_ERROR_CODES.VALIDATION
            );
          }

          validateEntity(input.sourceEntityId, input.sourceEntityType);
          const relationship = await fragmentManager.createAssociation(input.sourceEntityId, input.targetEntityId);

          return { success: true, data: relationship };
        }

        case RELATIONSHIP_TYPE.LINK: {
          if (input.sourceEntityType !== ENTITY_TYPE.FRAGMENT || input.targetEntityType !== ENTITY_TYPE.FRAGMENT) {
            throw new AppError("LINK requires a FRAGMENT on both ends", APP_ERROR_CODES.VALIDATION);
          }

          const relationship = await fragmentManager.createLink(input.sourceEntityId, input.targetEntityId);

          return { success: true, data: relationship };
        }
      }
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /**
   * Delete a relationship. Fragment ASSOCIATION/LINK edges are unlinked so the
   * orphan cascade runs; the collected fragment ids are returned (empty for MEMBERSHIP).
   */
  server.delete<{ Params: { id: string } }>("/api/relationships/:id", async (request) => {
    const relationshipId = validateUuidParam(request.params.id, "relationship");
    const relationship = circleManager.getRelationship(relationshipId);

    switch (relationship.relationshipType) {
      case RELATIONSHIP_TYPE.ASSOCIATION: {
        const collectedFragmentIds = await fragmentManager.unlinkFragment(
          { entityType: ENTITY_TYPE.AGENT, entityId: relationship.sourceEntityId },
          relationship.targetEntityId
        );

        return { success: true, data: { collectedFragmentIds } };
      }

      case RELATIONSHIP_TYPE.LINK: {
        const collectedFragmentIds = await fragmentManager.unlinkFragment(
          { entityType: ENTITY_TYPE.FRAGMENT, entityId: relationship.sourceEntityId },
          relationship.targetEntityId
        );

        return { success: true, data: { collectedFragmentIds } };
      }

      case RELATIONSHIP_TYPE.MEMBERSHIP: {
        await circleManager.deleteRelationship(relationshipId);

        return { success: true, data: { collectedFragmentIds: [] } };
      }
    }
  });
}
