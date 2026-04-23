import type { FastifyInstance } from "fastify";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { isString } from "es-toolkit";
import { generatePersona, generateAgentMd } from "../services/text-generation/md-generation.js";

export const GENERATION_TYPE = {
  PERSONA: "persona",
  AGENT_MD: "agentmd",
} as const;

const VALID_TYPES = new Set<string>(Object.values(GENERATION_TYPE));

/** Register the text generation route. */
export async function registerGenerationRoutes(server: FastifyInstance) {
  /** Generate text from a user prompt with type-specific system prompt */
  server.post<{ Body: { type?: string; prompt?: string; context?: string } }>("/api/generate", async (request) => {
    const { type, prompt, context } = request.body ?? {};
    if (!type || !VALID_TYPES.has(type)) {
      throw new AppError(`Invalid type - must be one of: ${[...VALID_TYPES].join(", ")}`, APP_ERROR_CODES.VALIDATION);
    }

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw new AppError("Prompt is required", APP_ERROR_CODES.VALIDATION);
    }

    const content =
      type === GENERATION_TYPE.PERSONA
        ? await generatePersona(prompt.trim(), isString(context) ? context : undefined)
        : await generateAgentMd(prompt.trim(), isString(context) ? context : undefined);

    return { success: true, data: { content } };
  });
}
