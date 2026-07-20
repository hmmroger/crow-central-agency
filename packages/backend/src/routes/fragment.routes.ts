import type { FastifyInstance } from "fastify";
import { CreateFragmentAssociationInputSchema, ENTITY_TYPE } from "@crow-central-agency/shared";
import type { FragmentManager } from "../services/fragment/fragment-manager.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import { validateAgentIdParam, validateUuidParam } from "../utils/validation.js";
import { wrapZodError } from "./route-utils.js";

/**
 * Register fragment sharing routes: user-managed agent → fragment
 * associations plus the reverse reachability query. Sharing is a user
 * capability, so these routes are not agent-scope-restricted.
 */
export async function registerFragmentRoutes(
  server: FastifyInstance,
  fragmentManager: FragmentManager,
  registry: AgentRegistry
) {
  /** Read a single full fragment (cue, body, usage, timestamps) */
  server.get<{ Params: { id: string } }>("/api/fragments/:id", async (request) => {
    const fragment = await fragmentManager.readFragment(request.params.id);

    return { success: true, data: fragment };
  });

  /** Associate an agent to a fragment (share) */
  server.post<{ Params: { id: string }; Body: unknown }>("/api/fragments/:id/associations", async (request) => {
    const fragmentId = validateUuidParam(request.params.id, "fragment");
    try {
      const input = CreateFragmentAssociationInputSchema.parse(request.body);
      const agentId = validateAgentIdParam(input.agentId);
      registry.getAgent(agentId);

      const relationship = await fragmentManager.createAssociation(agentId, fragmentId);

      return { success: true, data: relationship };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Remove an agent's association to a fragment (unshare) */
  server.delete<{ Params: { id: string; agentId: string } }>(
    "/api/fragments/:id/associations/:agentId",
    async (request) => {
      const fragmentId = validateUuidParam(request.params.id, "fragment");
      const agentId = validateAgentIdParam(request.params.agentId);
      // unlink (not plain removeAssociation) so a last-edge unshare cascade-collects orphans
      await fragmentManager.unlinkFragment({ entityType: ENTITY_TYPE.AGENT, entityId: agentId }, fragmentId);

      return { success: true, data: { deleted: true } };
    }
  );

  /** List the agents that can reach a fragment (reverse reachability) */
  server.get<{ Params: { id: string } }>("/api/fragments/:id/agents", async (request) => {
    const fragmentId = validateUuidParam(request.params.id, "fragment");
    await fragmentManager.readFragment(fragmentId);
    const agentIds = fragmentManager.getAgentsReachingFragment(fragmentId);

    return { success: true, data: agentIds };
  });
}
