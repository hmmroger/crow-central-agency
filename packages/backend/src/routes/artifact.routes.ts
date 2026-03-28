import type { FastifyInstance } from "fastify";
import type { ArtifactManager } from "../services/artifact-manager.js";
import { validateAgentIdParam } from "./validation.js";

/**
 * Register artifact REST routes
 */
export async function registerArtifactRoutes(server: FastifyInstance, artifactManager: ArtifactManager) {
  /** List artifacts for an agent */
  server.get<{ Params: { id: string } }>("/api/agents/:id/artifacts", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const artifacts = await artifactManager.listArtifacts(agentId);

    return { success: true, data: artifacts };
  });

  /** Read a specific artifact */
  server.get<{ Params: { id: string; filename: string } }>("/api/agents/:id/artifacts/:filename", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const content = await artifactManager.readArtifact(agentId, request.params.filename);

    return { success: true, data: { filename: request.params.filename, content } };
  });
}
