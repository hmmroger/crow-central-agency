import type { FastifyInstance } from "fastify";
import {
  ENTITY_TYPE,
  FRAGMENT_KIND,
  RELATIONSHIP_DIRECTION,
  RELATIONSHIP_TYPE,
  RelationshipDirectionSchema,
  type Fragment,
  type FragmentRelationshipEntity,
} from "@crow-central-agency/shared";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { FragmentManager } from "../services/fragment/fragment-manager.js";
import type { RelationshipManager } from "../services/relationship-manager.js";
import type { FragmentCueIndexEntry } from "../services/fragment/fragment-manager.types.js";
import { wrapZodError } from "./route-utils.js";

/** Project a cue index entry into a fragment candidate row */
function toFragmentCandidate(cue: FragmentCueIndexEntry): FragmentRelationshipEntity {
  return { entityType: ENTITY_TYPE.FRAGMENT, id: cue.id, cue: cue.cue, kind: cue.kind };
}

/**
 * Register fragment read routes plus the relationship-candidates lookup that
 * backs the create picker. Relationship edits themselves go through the general
 * /api/relationships routes.
 */
export async function registerFragmentRoutes(
  server: FastifyInstance,
  fragmentManager: FragmentManager,
  registry: AgentRegistry,
  relationshipManager: RelationshipManager
) {
  /**
   * Entities that may become a new parent of the open fragment (the picked
   * candidate is the edge source, the open fragment the target). Agents anchor
   * via ASSOCIATION; fragments link via LINK. Background agents are excluded —
   * the map never draws them, so anchoring to one would leave an unresolvable row.
   */
  const buildParentCandidates = (
    openFragment: Fragment,
    cues: FragmentCueIndexEntry[]
  ): FragmentRelationshipEntity[] => {
    const openIsKnowledge = openFragment.kind === FRAGMENT_KIND.KNOWLEDGE;

    const agentCandidates: FragmentRelationshipEntity[] = [];
    if (!openIsKnowledge) {
      const anchoredAgentIds = new Set(
        relationshipManager
          .queryRelationships({
            targetEntityId: openFragment.id,
            targetEntityType: ENTITY_TYPE.FRAGMENT,
            relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
          })
          .map((association) => association.sourceEntityId)
      );

      for (const agent of registry.getAllAgents(false)) {
        if (!anchoredAgentIds.has(agent.id)) {
          agentCandidates.push({ entityType: ENTITY_TYPE.AGENT, id: agent.id, name: agent.name });
        }
      }
    }

    const existingParentIds = new Set(
      relationshipManager
        .queryRelationships({
          targetEntityId: openFragment.id,
          targetEntityType: ENTITY_TYPE.FRAGMENT,
          relationshipType: RELATIONSHIP_TYPE.LINK,
        })
        .map((link) => link.sourceEntityId)
    );

    const fragmentCandidates = cues
      .filter((cue) => {
        if (cue.id === openFragment.id || existingParentIds.has(cue.id)) {
          return false;
        }

        // KNOWLEDGE can never be a parent; a KNOWLEDGE child accepts only a DOMAIN parent
        const kindAllowed = openIsKnowledge ? cue.kind === FRAGMENT_KIND.DOMAIN : cue.kind !== FRAGMENT_KIND.KNOWLEDGE;
        if (!kindAllowed) {
          return false;
        }

        // Candidate reachable from the open fragment ⇒ making it a parent closes a cycle
        return !relationshipManager.canReach(openFragment.id, cue.id, { relationshipType: RELATIONSHIP_TYPE.LINK });
      })
      .map(toFragmentCandidate);

    return [...agentCandidates, ...fragmentCandidates];
  };

  /**
   * Fragments that may become a new child of the open fragment (the open
   * fragment is the edge source, the candidate the target). Always a LINK, so
   * agents never appear. Empty when the open fragment is KNOWLEDGE — a leaf that
   * cannot parent anything.
   */
  const buildChildCandidates = (
    openFragment: Fragment,
    cues: FragmentCueIndexEntry[]
  ): FragmentRelationshipEntity[] => {
    if (openFragment.kind === FRAGMENT_KIND.KNOWLEDGE) {
      return [];
    }

    const openIsDomain = openFragment.kind === FRAGMENT_KIND.DOMAIN;

    const existingChildIds = new Set(
      relationshipManager
        .queryRelationships({
          sourceEntityId: openFragment.id,
          sourceEntityType: ENTITY_TYPE.FRAGMENT,
          relationshipType: RELATIONSHIP_TYPE.LINK,
        })
        .map((link) => link.targetEntityId)
    );

    return cues
      .filter((cue) => {
        if (cue.id === openFragment.id || existingChildIds.has(cue.id)) {
          return false;
        }

        // KNOWLEDGE may be a child only under a DOMAIN parent
        const kindAllowed = cue.kind !== FRAGMENT_KIND.KNOWLEDGE || openIsDomain;
        if (!kindAllowed) {
          return false;
        }

        // Candidate already reaches the open fragment ⇒ making it a child closes a cycle
        return !relationshipManager.canReach(cue.id, openFragment.id, { relationshipType: RELATIONSHIP_TYPE.LINK });
      })
      .map(toFragmentCandidate);
  };

  /** Read a single full fragment (cue, body, usage, timestamps) */
  server.get<{ Params: { id: string } }>("/api/fragments/:id", async (request) => {
    const fragment = await fragmentManager.readFragment(request.params.id);

    return { success: true, data: fragment };
  });

  /**
   * Entities the open fragment may form a new relationship with, keyed on
   * direction. TARGET picks a parent, SOURCE picks a child. Kind rules and DAG
   * cycle exclusion are applied here — asymmetrically between directions — so the
   * picker never offers an option the create would reject.
   */
  server.get<{ Params: { id: string }; Querystring: { direction?: string } }>(
    "/api/fragments/:id/relationship-candidates",
    async (request) => {
      try {
        const direction = RelationshipDirectionSchema.parse(request.query.direction);
        const openFragment = await fragmentManager.readFragment(request.params.id);
        const cues = await fragmentManager.getAllFragmentCues();

        const candidates =
          direction === RELATIONSHIP_DIRECTION.TARGET
            ? buildParentCandidates(openFragment, cues)
            : buildChildCandidates(openFragment, cues);

        return { success: true, data: candidates };
      } catch (error) {
        return wrapZodError(error);
      }
    }
  );
}
