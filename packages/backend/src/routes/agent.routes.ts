import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { AgentOrchestrator } from "../services/agent-orchestrator.js";
import type { SessionManager } from "../services/session-manager.js";
import { AppError } from "../error/app-error.js";
import { AppErrorCodes } from "../error/app-error.types.js";
import { logger } from "../utils/logger.js";

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
export async function registerAgentRoutes(
  server: FastifyInstance,
  registry: AgentRegistry,
  orchestrator: AgentOrchestrator,
  sessionManager: SessionManager
) {
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
      return wrapZodError(error);
    }
  });

  /** Update an existing agent */
  server.patch<{ Params: { id: string }; Body: unknown }>("/api/agents/:id", async (request) => {
    const agentId = validateUuidParam(request.params.id);

    try {
      const agent = await registry.update(agentId, request.body as Parameters<typeof registry.update>[1]);

      return { success: true, data: agent };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Delete an agent */
  server.delete<{ Params: { id: string } }>("/api/agents/:id", async (request) => {
    const agentId = validateUuidParam(request.params.id);
    await registry.delete(agentId);

    return { success: true, data: { deleted: true } };
  });

  // --- Messaging & Session routes ---

  /** Send a message to an agent (REST alternative to WS send_message) */
  server.post<{ Params: { id: string }; Body: { message: string } }>("/api/agents/:id/send", async (request) => {
    const agentId = validateUuidParam(request.params.id);
    const { message } = request.body;

    if (!message || typeof message !== "string") {
      throw new AppError("Message is required", AppErrorCodes.Validation);
    }

    // Fire-and-forget — response is streamed via WS
    orchestrator.sendMessage(agentId, message).catch((error) => {
      // Errors are broadcast to WS subscribers
      logger.error({ agentId, error }, "Send message failed");
    });

    return { success: true, data: { sent: true } };
  });

  /** Stop an active agent */
  server.post<{ Params: { id: string } }>("/api/agents/:id/stop", async (request) => {
    const agentId = validateUuidParam(request.params.id);
    await orchestrator.stopAgent(agentId);

    return { success: true, data: { stopped: true } };
  });

  /** Get messages for an agent's current session */
  server.get<{ Params: { id: string } }>("/api/agents/:id/messages", async (request) => {
    const agentId = validateUuidParam(request.params.id);
    const agent = registry.get(agentId);

    if (!agent) {
      throw new AppError(`Agent not found: ${agentId}`, AppErrorCodes.AgentNotFound);
    }

    const state = orchestrator.getState(agentId);

    if (!state?.sessionId) {
      return { success: true, data: [] };
    }

    const messages = await sessionManager.loadMessages(state.sessionId, agent.workspace);

    return { success: true, data: messages };
  });

  /** Start a new session for an agent */
  server.post<{ Params: { id: string } }>("/api/agents/:id/session/new", async (request) => {
    const agentId = validateUuidParam(request.params.id);
    const state = orchestrator.getState(agentId);

    if (state?.sessionId) {
      sessionManager.invalidateCache(state.sessionId);
    }

    orchestrator.newSession(agentId);

    return { success: true, data: { newSession: true } };
  });

  /** Trigger manual compaction for an agent's session (fire-and-forget, like /send) */
  server.post<{ Params: { id: string } }>("/api/agents/:id/session/compact", async (request) => {
    const agentId = validateUuidParam(request.params.id);
    const state = orchestrator.getState(agentId);

    if (!state?.sessionId) {
      throw new AppError("No active session", AppErrorCodes.SessionNotFound);
    }

    const sessionIdBeforeCompact = state.sessionId;

    // Fire-and-forget — result delivered via WS, consistent with /send
    orchestrator
      .sendMessage(agentId, "/compact")
      .then(() => {
        sessionManager.invalidateCache(sessionIdBeforeCompact);

        const updatedState = orchestrator.getState(agentId);

        if (updatedState?.sessionId && updatedState.sessionId !== sessionIdBeforeCompact) {
          sessionManager.invalidateCache(updatedState.sessionId);
        }
      })
      .catch((error) => {
        logger.error({ agentId, error }, "Compact failed");
      });

    return { success: true, data: { compacted: true } };
  });

  /** List sessions for an agent */
  server.get<{ Params: { id: string } }>("/api/agents/:id/sessions", async (request) => {
    const agentId = validateUuidParam(request.params.id);
    const agent = registry.get(agentId);

    if (!agent) {
      throw new AppError(`Agent not found: ${agentId}`, AppErrorCodes.AgentNotFound);
    }

    const sessions = await sessionManager.listSessions(agent.workspace);

    return { success: true, data: sessions };
  });

  /** Get runtime state for an agent */
  server.get<{ Params: { id: string } }>("/api/agents/:id/state", async (request) => {
    const agentId = validateUuidParam(request.params.id);
    const state = orchestrator.getState(agentId);

    return { success: true, data: state ?? { agentId, status: "idle" } };
  });
}
