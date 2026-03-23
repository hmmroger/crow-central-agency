import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import type { AgentRegistry } from "../services/agent-registry.js";
import { AppError } from "../error/app-error.js";
import { AppErrorCodes } from "../error/app-error.types.js";

const uuidParamSchema = z.uuid();

/** Validate that a route param is a valid UUID */
function validateUuidParam(id: string): string {
  const result = uuidParamSchema.safeParse(id);

  if (!result.success) {
    throw new AppError("Invalid agent id", AppErrorCodes.Validation);
  }

  return result.data;
}

/** Wrap ZodError into AppError for consistent error responses */
function wrapZodError(error: unknown): never {
  if (error instanceof ZodError) {
    throw new AppError("Invalid input", AppErrorCodes.Validation);
  }

  throw error;
}

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
    const agentId = validateUuidParam(request.params.id);
    const agent = registry.get(agentId);

    if (!agent) {
      throw new AppError(`Agent not found: ${agentId}`, AppErrorCodes.AgentNotFound);
    }

    return { success: true, data: agent };
  });

  /** Create a new agent */
  server.post<{ Body: unknown }>("/api/agents", async (request) => {
    try {
      const agent = await registry.create(request.body as Parameters<typeof registry.create>[0]);

      return { success: true, data: agent };
    } catch (error) {
      wrapZodError(error);
    }
  });

  /** Update an existing agent */
  server.patch<{ Params: { id: string }; Body: unknown }>("/api/agents/:id", async (request) => {
    const agentId = validateUuidParam(request.params.id);

    try {
      const agent = await registry.update(agentId, request.body as Parameters<typeof registry.update>[1]);

      return { success: true, data: agent };
    } catch (error) {
      wrapZodError(error);
    }
  });

  /** Delete an agent */
  server.delete<{ Params: { id: string } }>("/api/agents/:id", async (request) => {
    const agentId = validateUuidParam(request.params.id);
    await registry.delete(agentId);

    return { success: true, data: { deleted: true } };
  });
}
