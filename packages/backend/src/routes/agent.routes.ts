import type { FastifyInstance } from "fastify";
import type { AgentRegistry } from "../services/agent-registry.js";
import { AppError } from "../error/app-error.js";
import { AppErrorCodes } from "../error/app-error.types.js";

/**
 * Register agent CRUD routes
 */
export async function registerAgentRoutes(server: FastifyInstance, registry: AgentRegistry) {
  /** List all agents */
  server.get("/api/agents", async () => {
    const agents = registry.getAll();

    return { success: true, data: agents };
  });

  /** Get a single agent by ID */
  server.get<{ Params: { id: string } }>("/api/agents/:id", async (request) => {
    const agent = registry.get(request.params.id);

    if (!agent) {
      throw new AppError(`Agent not found: ${request.params.id}`, AppErrorCodes.AgentNotFound);
    }

    return { success: true, data: agent };
  });

  /** Create a new agent */
  server.post<{ Body: unknown }>("/api/agents", async (request) => {
    const agent = await registry.create(request.body as Parameters<typeof registry.create>[0]);

    return { success: true, data: agent };
  });

  /** Update an existing agent */
  server.patch<{ Params: { id: string }; Body: unknown }>("/api/agents/:id", async (request) => {
    const existing = registry.get(request.params.id);

    if (!existing) {
      throw new AppError(`Agent not found: ${request.params.id}`, AppErrorCodes.AgentNotFound);
    }

    const agent = await registry.update(request.params.id, request.body as Parameters<typeof registry.update>[1]);

    return { success: true, data: agent };
  });

  /** Delete an agent */
  server.delete<{ Params: { id: string } }>("/api/agents/:id", async (request) => {
    const existing = registry.get(request.params.id);

    if (!existing) {
      throw new AppError(`Agent not found: ${request.params.id}`, AppErrorCodes.AgentNotFound);
    }

    await registry.delete(request.params.id);

    return { success: true, data: { deleted: true } };
  });
}
