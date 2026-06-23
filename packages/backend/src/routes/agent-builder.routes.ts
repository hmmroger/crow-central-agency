import type { FastifyInstance } from "fastify";
import { AgentBuilderDesignRequestSchema, AgentBuilderPatchRequestSchema } from "@crow-central-agency/shared";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import type { WorldBuilderService } from "../services/world-builder/world-builder-service.js";

/** Register the agent-builder routes, backed by the World Builder agent and the draft store. */
export async function registerAgentBuilderRoutes(server: FastifyInstance, worldBuilderService: WorldBuilderService) {
  /** Get the single active draft, or null when none exists. */
  server.get("/api/agent-builder/draft", async () => {
    const draft = await worldBuilderService.getDraft();
    return { success: true, data: { draft: draft ?? null } };
  });

  /** Design or refine the fleet from a requirement, persisting the result as the draft. */
  server.post("/api/agent-builder/design", async (request) => {
    const parsed = AgentBuilderDesignRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("Invalid design request", APP_ERROR_CODES.VALIDATION);
    }

    const draft = await worldBuilderService.design(parsed.data.input);
    return { success: true, data: { draft } };
  });

  /** Replace the draft's fleet-level config (project path + agent type). */
  server.patch("/api/agent-builder/draft", async (request) => {
    const parsed = AgentBuilderPatchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("Invalid draft patch", APP_ERROR_CODES.VALIDATION);
    }

    const draft = await worldBuilderService.setFleetConfig(parsed.data);
    return { success: true, data: { draft } };
  });

  /** Clear the active draft entirely. */
  server.delete("/api/agent-builder/draft", async () => {
    await worldBuilderService.resetDraft();
    return { success: true };
  });

  /** Build the drafted fleet: author, create, and place each agent. Best-effort and per-agent. */
  server.post("/api/agent-builder/build", async () => {
    const result = await worldBuilderService.build();
    return { success: true, data: { result } };
  });
}
