import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { MdGenerationService } from "../services/md-generation-service.js";
import { AppError } from "../error/app-error.js";
import { AppErrorCodes } from "../error/app-error.types.js";

const uuidParamSchema = z.uuid();

/**
 * Register generation routes (persona, AGENT.md) and AGENT.md CRUD.
 * Generation routes only registered if generationService is provided (OPENAI configured).
 */
export async function registerGenerationRoutes(
  server: FastifyInstance,
  registry: AgentRegistry,
  generationService?: MdGenerationService
) {
  /** Read AGENT.md for an agent */
  server.get<{ Params: { id: string } }>("/api/agents/:id/agent-md", async (request) => {
    const parseResult = uuidParamSchema.safeParse(request.params.id);

    if (!parseResult.success) {
      throw new AppError("Invalid agent id", AppErrorCodes.Validation);
    }

    const content = await registry.getAgentMd(parseResult.data);

    return { success: true, data: { content: content ?? "" } };
  });

  /** Write AGENT.md for an agent */
  server.put<{ Params: { id: string }; Body: { content: string } }>("/api/agents/:id/agent-md", async (request) => {
    const parseResult = uuidParamSchema.safeParse(request.params.id);

    if (!parseResult.success) {
      throw new AppError("Invalid agent id", AppErrorCodes.Validation);
    }

    const { content } = request.body;

    if (typeof content !== "string") {
      throw new AppError("Content is required", AppErrorCodes.Validation);
    }

    await registry.setAgentMd(parseResult.data, content);

    return { success: true, data: { saved: true } };
  });

  // Generation routes — only if service is available
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
