import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { MdGenerationService } from "../services/md-generation-service.js";
import { AppError } from "../error/app-error.js";
import { AppErrorCodes } from "../error/app-error.types.js";

const uuidParamSchema = z.uuid();

/**
 * Register generation routes (persona, AGENT.md).
 * Only registered if generationService is provided (OPENAI configured).
 */
export async function registerGenerationRoutes(
  server: FastifyInstance,
  registry: AgentRegistry,
  generationService?: MdGenerationService
) {
  if (!generationService) {
    return;
  }

  /** Generate persona */
  server.post<{ Params: { id: string } }>("/api/agents/:id/generate-persona", async (request) => {
    const parseResult = uuidParamSchema.safeParse(request.params.id);

    if (!parseResult.success) {
      throw new AppError("Invalid agent id", AppErrorCodes.Validation);
    }

    const agent = registry.get(parseResult.data);

    if (!agent) {
      throw new AppError("Agent not found", AppErrorCodes.AgentNotFound);
    }

    const content = await generationService.generatePersona({
      agentName: agent.name,
      agentDescription: agent.description,
      existingPersona: agent.persona || undefined,
    });

    return { success: true, data: { content } };
  });

  /** Generate AGENT.md */
  server.post<{ Params: { id: string } }>("/api/agents/:id/generate-agentmd", async (request) => {
    const parseResult = uuidParamSchema.safeParse(request.params.id);

    if (!parseResult.success) {
      throw new AppError("Invalid agent id", AppErrorCodes.Validation);
    }

    const agent = registry.get(parseResult.data);

    if (!agent) {
      throw new AppError("Agent not found", AppErrorCodes.AgentNotFound);
    }

    const content = await generationService.generateAgentMd({
      agentName: agent.name,
      agentDescription: agent.description,
      existingPersona: agent.persona || undefined,
    });

    return { success: true, data: { content } };
  });
}
