import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ArtifactManager } from "../services/artifact-manager.js";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";

const uuidParamSchema = z.uuid();

/**
 * Register artifact REST routes
 */
export async function registerArtifactRoutes(server: FastifyInstance, artifactManager: ArtifactManager) {
  /** List artifacts for an agent */
  server.get<{ Params: { id: string } }>("/api/agents/:id/artifacts", async (request) => {
    const parseResult = uuidParamSchema.safeParse(request.params.id);

    if (!parseResult.success) {
      throw new AppError("Invalid agent id", APP_ERROR_CODES.VALIDATION);
    }

    const artifacts = await artifactManager.listArtifacts(parseResult.data);

    return { success: true, data: artifacts };
  });

  /** Read a specific artifact */
  server.get<{ Params: { id: string; filename: string } }>("/api/agents/:id/artifacts/:filename", async (request) => {
    const parseResult = uuidParamSchema.safeParse(request.params.id);

    if (!parseResult.success) {
      throw new AppError("Invalid agent id", APP_ERROR_CODES.VALIDATION);
    }

    const content = await artifactManager.readArtifact(parseResult.data, request.params.filename);

    return { success: true, data: { filename: request.params.filename, content } };
  });
}
