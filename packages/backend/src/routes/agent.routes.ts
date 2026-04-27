import type { FastifyInstance } from "fastify";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { AgentRuntimeManager } from "../services/runtime/agent-runtime-manager.js";
import type { SessionManager } from "../services/session/session-manager.js";
import { AGENT_STATUS, AgentConfigTemplateSchema, type AgentRuntimeState } from "@crow-central-agency/shared";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { logger } from "../utils/logger.js";
import { validateAgentIdParam, validateUuidParam } from "../utils/validation.js";
import { wrapZodError } from "./route-utils.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import { captureClientInfo } from "../sensors/capture-client-info.js";
import { sanitizeAgentConfig, sanitizeAgentConfigs } from "../utils/agent-config-sanitizer.js";

/**
 * Register agent CRUD routes
 */
export async function registerAgentRoutes(
  server: FastifyInstance,
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager,
  sessionManager: SessionManager,
  store: ObjectStoreProvider
) {
  /** List all agents */
  server.get("/api/agents", async () => {
    await captureClientInfo(store);
    const agents = registry.getAllAgents();

    return { success: true, data: sanitizeAgentConfigs(agents) };
  });

  /** List all saved agent config templates */
  server.get("/api/agent-templates", async () => {
    const templates = await registry.getTemplates();

    return { success: true, data: templates };
  });

  /** Delete a saved agent config template */
  server.delete<{ Params: { templateId: string } }>("/api/agent-templates/:templateId", async (request) => {
    const templateId = validateUuidParam(request.params.templateId, "template");
    const deleted = await registry.deleteTemplate(templateId);

    return { success: true, data: { deleted } };
  });

  /** Get a single agent by ID, including AGENT.md content */
  server.get<{ Params: { id: string } }>("/api/agents/:id", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const agent = registry.getAgent(agentId);
    const agentMd = await registry.getAgentMd(agentId);

    return { success: true, data: { ...sanitizeAgentConfig(agent), agentMd: agentMd ?? "" } };
  });

  /** Create a new agent */
  server.post<{ Body: unknown }>("/api/agents", async (request) => {
    try {
      const agent = await registry.createAgent(request.body as Parameters<typeof registry.createAgent>[0]);

      return { success: true, data: sanitizeAgentConfig(agent) };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Update an existing agent */
  server.patch<{ Params: { id: string }; Body: unknown }>("/api/agents/:id", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);

    try {
      const agent = await registry.updateAgent(agentId, request.body as Parameters<typeof registry.updateAgent>[1]);

      return { success: true, data: sanitizeAgentConfig(agent) };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Delete an agent */
  server.delete<{ Params: { id: string } }>("/api/agents/:id", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    await registry.deleteAgent(agentId);

    return { success: true, data: { deleted: true } };
  });

  /** Save an agent's config as a reusable template */
  server.post<{ Params: { id: string }; Body: { templateName?: unknown } }>(
    "/api/agents/:id/save-as-template",
    async (request) => {
      const agentId = validateAgentIdParam(request.params.id);

      try {
        const templateName = AgentConfigTemplateSchema.shape.templateName.parse(request.body?.templateName);
        const template = await registry.saveAgentAsTemplate(agentId, templateName);

        return { success: true, data: template };
      } catch (error) {
        return wrapZodError(error);
      }
    }
  );

  // --- Messaging & Session routes ---

  /** Send a message to an agent (REST alternative to WS send_message) */
  server.post<{ Params: { id: string }; Body: { message: string } }>("/api/agents/:id/send", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const { message } = request.body;

    if (!message || typeof message !== "string") {
      throw new AppError("Message is required", APP_ERROR_CODES.VALIDATION);
    }

    // Fire-and-forget - response is streamed via WS
    runtimeManager.sendMessage(agentId, message).catch((error) => {
      // Errors are broadcast to WS subscribers
      logger.error({ agentId, error }, "Send message failed");
    });

    return { success: true, data: { sent: true } };
  });

  /** Stop an active agent */
  server.post<{ Params: { id: string } }>("/api/agents/:id/stop", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    await runtimeManager.stopAgent(agentId);

    return { success: true, data: { stopped: true } };
  });

  /** Get messages for an agent's current session */
  server.get<{ Params: { id: string } }>("/api/agents/:id/messages", async (request) => {
    await captureClientInfo(store);
    const agentId = validateAgentIdParam(request.params.id);
    const agent = registry.getAgent(agentId);
    const state = runtimeManager.getState(agentId);

    if (!state?.sessionId) {
      return { success: true, data: [] };
    }

    const messages = await sessionManager.loadMessages(state.sessionId, registry.resolveWorkspace(agent));

    return { success: true, data: messages };
  });

  /** Generate audio for a specific message in the agent's current session */
  server.post<{ Params: { id: string; messageId: string } }>(
    "/api/agents/:id/messages/:messageId/audio",
    async (request) => {
      const agentId = validateAgentIdParam(request.params.id);
      const message = await runtimeManager.generateAudioForMessage(agentId, request.params.messageId);
      return { success: true, data: message };
    }
  );

  /** Stream the audio binary for a specific message in the agent's current session */
  server.get<{ Params: { id: string; messageId: string } }>(
    "/api/agents/:id/messages/:messageId/audio",
    async (request, reply) => {
      const agentId = validateAgentIdParam(request.params.id);
      const state = runtimeManager.getState(agentId);
      if (!state?.sessionId) {
        throw new AppError(`Agent ${agentId} has no active session`, APP_ERROR_CODES.SESSION_NOT_FOUND);
      }

      const audio = await sessionManager.getAudioMessage(state.sessionId, request.params.messageId);
      return reply.type(audio.mimeType ?? "application/octet-stream").send(audio.data);
    }
  );

  /** Start a new session for an agent */
  server.post<{ Params: { id: string } }>("/api/agents/:id/session/new", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const state = runtimeManager.getState(agentId);

    if (state?.sessionId) {
      sessionManager.invalidateCache(state.sessionId);
    }

    await runtimeManager.newSession(agentId);

    return { success: true, data: { newSession: true } };
  });

  /** List sessions for an agent */
  server.get<{ Params: { id: string } }>("/api/agents/:id/sessions", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const agent = registry.getAgent(agentId);
    const sessions = await sessionManager.listSessions(registry.resolveWorkspace(agent));

    return { success: true, data: sessions };
  });

  /** Get runtime state for an agent */
  server.get<{ Params: { id: string } }>("/api/agents/:id/state", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const state = runtimeManager.getState(agentId);

    const defaultState: AgentRuntimeState = {
      agentId,
      status: AGENT_STATUS.IDLE,
      sessionUsage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0, contextUsed: 0, contextTotal: 0 },
    };

    return { success: true, data: state ?? defaultState };
  });

  /** Get persisted activities for an agent, oldest first */
  server.get<{ Params: { id: string } }>("/api/agents/:id/activities", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const activities = runtimeManager.getActivities(agentId) ?? [];

    return { success: true, data: activities };
  });
}
