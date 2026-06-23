import type { FastifyInstance } from "fastify";
import { GenerateRequestSchema } from "@crow-central-agency/shared";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import type { WorldBuilderService } from "../services/world-builder/world-builder-service.js";

/** Register the text generation route, backed by the internal Narrative Architect agent. */
export async function registerGenerationRoutes(server: FastifyInstance, worldBuilderService: WorldBuilderService) {
  /** Generate a persona or AGENT.md from a structured request. */
  server.post("/api/generate", async (request) => {
    const parsed = GenerateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("Invalid generation request", APP_ERROR_CODES.VALIDATION);
    }

    const content = await worldBuilderService.generateAgentText(parsed.data);
    return { success: true, data: { content } };
  });
}
