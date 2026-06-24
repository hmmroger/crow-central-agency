import type { FastifyInstance } from "fastify";
import {
  AgentBuilderDesignRequestSchema,
  AgentBuilderPatchRequestSchema,
  type AgentBuilderDraftResponse,
  type AgentBuilderDraftMutationResponse,
} from "@crow-central-agency/shared";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import type { WorldBuilderService } from "../services/world-builder/world-builder-service.js";

/** Register the agent-builder routes, backed by the World Builder agent and the draft store. */
export async function registerAgentBuilderRoutes(server: FastifyInstance, worldBuilderService: WorldBuilderService) {
  /** Get the single active draft, or null when none exists. */
  server.get("/api/agent-builder/draft", async () => {
    const draft = await worldBuilderService.getDraft();
    const data: AgentBuilderDraftResponse = { draft: draft ?? null };
    return { success: true, data };
  });

  /** Design or refine the fleet from a requirement, persisting the result as the draft. */
  server.post("/api/agent-builder/design", async (request) => {
    const parsed = AgentBuilderDesignRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("Invalid design request", APP_ERROR_CODES.VALIDATION);
    }

    const draft = await worldBuilderService.design(parsed.data.input);
    const data: AgentBuilderDraftMutationResponse = { draft };
    return { success: true, data };
  });

  /** Replace the draft's fleet-level config (project path + agent type). */
  server.patch("/api/agent-builder/draft", async (request) => {
    const parsed = AgentBuilderPatchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("Invalid draft patch", APP_ERROR_CODES.VALIDATION);
    }

    const draft = await worldBuilderService.setFleetConfig(parsed.data);
    const data: AgentBuilderDraftMutationResponse = { draft };
    return { success: true, data };
  });

  /** Clear the active draft entirely. */
  server.delete("/api/agent-builder/draft", async () => {
    await worldBuilderService.resetDraft();
    return { success: true };
  });

  /**
   * Start building the drafted fleet. Returns 202 immediately; the build runs server-side and its
   * progress/outcome reach clients via the agent-builder draft-updated WS broadcast.
   */
  server.post("/api/agent-builder/build", async (_request, reply) => {
    await worldBuilderService.startBuild();
    reply.code(202);
    return { success: true };
  });
}
