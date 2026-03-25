import type { FastifyInstance } from "fastify";
import type { MdGenerationService } from "../services/md-generation-service.js";
import { GENERATION_TYPE, type GenerationType } from "../services/md-generation-service.types.js";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";

const VALID_TYPES = new Set<string>(Object.values(GENERATION_TYPE));

/**
 * Register the text generation route.
 * Only registered if generationService is provided (OPENAI configured).
 */
export async function registerGenerationRoutes(server: FastifyInstance, generationService?: MdGenerationService) {
  if (!generationService) {
    return;
  }

  /** Generate text from a user prompt with type-specific system prompt */
  server.post<{ Body: { type?: string; prompt?: string; context?: string } }>("/api/generate", async (request) => {
    const { type, prompt, context } = request.body ?? {};

    if (!type || !VALID_TYPES.has(type)) {
      throw new AppError(`Invalid type — must be one of: ${[...VALID_TYPES].join(", ")}`, APP_ERROR_CODES.VALIDATION);
    }

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw new AppError("Prompt is required", APP_ERROR_CODES.VALIDATION);
    }

    const content = await generationService.generate({
      type: type as GenerationType,
      prompt: prompt.trim(),
      context: typeof context === "string" ? context : undefined,
    });

    return { success: true, data: { content } };
  });
}
