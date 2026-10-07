import type { FastifyInstance } from "fastify";
import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  CreateAgentCircleInputSchema,
  CreateRelationshipInputSchema,
  EntityTypeSchema,
  UpdateAgentCircleInputSchema,
  type EntityType,
  type RelationshipType,
} from "@crow-central-agency/shared";
import type { AgentCircleManager } from "../services/agent-circle-manager.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { FragmentManager } from "../services/fragment/fragment-manager.js";
import type { NotesManager } from "../services/notes/notes-manager.js";
import type { TagManager } from "../services/tag/tag-manager.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { validateAgentIdParam, validateCircleIdParam, validateUuidParam } from "../utils/validation.js";
import { deletedResponse, wrapZodError } from "./route-utils.js";

/** Entity types allowed at each end of a relationship type */
interface RelationshipEndpointRule {
  sourceEntityTypes: ReadonlyArray<EntityType>;
  targetEntityTypes: ReadonlyArray<EntityType>;
  message: string;
}

const RELATIONSHIP_ENDPOINT_RULES: Record<RelationshipType, RelationshipEndpointRule> = {
  [RELATIONSHIP_TYPE.MEMBERSHIP]: {
    sourceEntityTypes: [ENTITY_TYPE.AGENT_CIRCLE],
    targetEntityTypes: [ENTITY_TYPE.AGENT, ENTITY_TYPE.AGENT_CIRCLE],
    message: "MEMBERSHIP requires an AGENT_CIRCLE source and an AGENT or AGENT_CIRCLE target",
  },
  [RELATIONSHIP_TYPE.ASSOCIATION]: {
    sourceEntityTypes: [ENTITY_TYPE.AGENT],
    targetEntityTypes: [ENTITY_TYPE.FRAGMENT],
    message: "ASSOCIATION requires an AGENT source and a FRAGMENT target",
  },
  [RELATIONSHIP_TYPE.LINK]: {
    sourceEntityTypes: [ENTITY_TYPE.FRAGMENT],
    targetEntityTypes: [ENTITY_TYPE.FRAGMENT],
    message: "LINK requires a FRAGMENT on both ends",
  },
  [RELATIONSHIP_TYPE.TAGGED]: {
    sourceEntityTypes: EntityTypeSchema.options.filter((entityType) => entityType !== ENTITY_TYPE.TAG),
    targetEntityTypes: [ENTITY_TYPE.TAG],
    message: "TAGGED requires a non-TAG source and a TAG target",
  },
};

/**
 * Register circle and relationship CRUD routes.
 * Circles group agents; relationships define membership between entities and,
 * for fragments, the ASSOCIATION/LINK edges that anchor and connect them, and
 * TAGGED edges from any entity to a tag.
 */
export async function registerCircleRoutes(
  server: FastifyInstance,
  circleManager: AgentCircleManager,
  registry: AgentRegistry,
  fragmentManager: FragmentManager,
  notesManager: NotesManager,
  tagManager: TagManager
) {
  const validateEntity = async (entityId: string, entityType: EntityType): Promise<void> => {
    switch (entityType) {
      case ENTITY_TYPE.AGENT:
        registry.getAgent(entityId);
        break;

      case ENTITY_TYPE.AGENT_CIRCLE:
        circleManager.getCircle(entityId);
        break;

      case ENTITY_TYPE.FRAGMENT:
        await fragmentManager.readFragment(entityId);
        break;

      case ENTITY_TYPE.NOTE:
      case ENTITY_TYPE.NOTE_FOLDER:
        if (notesManager.getNote(entityId).entityType !== entityType) {
          throw new AppError(`Entity ${entityId} is not a ${entityType}`, APP_ERROR_CODES.VALIDATION);
        }

        break;

      case ENTITY_TYPE.TAG:
        tagManager.getTag(entityId);
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

    return deletedResponse();
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
      await validateEntity(input.sourceEntityId, input.sourceEntityType);
      await validateEntity(input.targetEntityId, input.targetEntityType);

      const endpointRule = RELATIONSHIP_ENDPOINT_RULES[input.relationshipType];
      if (
        !endpointRule.sourceEntityTypes.includes(input.sourceEntityType) ||
        !endpointRule.targetEntityTypes.includes(input.targetEntityType)
      ) {
        throw new AppError(endpointRule.message, APP_ERROR_CODES.VALIDATION);
      }

      switch (input.relationshipType) {
        case RELATIONSHIP_TYPE.MEMBERSHIP: {
          const relationship = await circleManager.createRelationship(input);

          return { success: true, data: relationship };
        }

        case RELATIONSHIP_TYPE.ASSOCIATION: {
          const relationship = await fragmentManager.createAssociation(input.sourceEntityId, input.targetEntityId);

          return { success: true, data: relationship };
        }

        case RELATIONSHIP_TYPE.LINK: {
          const relationship = await fragmentManager.createLink(input.sourceEntityId, input.targetEntityId);

          return { success: true, data: relationship };
        }

        case RELATIONSHIP_TYPE.TAGGED: {
          const relationship = await tagManager.tagEntity(
            input.sourceEntityType,
            input.sourceEntityId,
            input.targetEntityId
          );

          return { success: true, data: relationship };
        }
      }
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /**
   * Delete a relationship. Fragment ASSOCIATION/LINK edges are unlinked so the
   * orphan cascade runs; the collected fragment ids are returned (empty for MEMBERSHIP and TAGGED).
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

      case RELATIONSHIP_TYPE.TAGGED: {
        await tagManager.untagEntity(relationshipId);

        return { success: true, data: { collectedFragmentIds: [] } };
      }
    }
  });
}
