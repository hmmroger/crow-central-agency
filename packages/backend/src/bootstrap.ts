import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { createServer } from "./server/create-server.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerAgentRoutes } from "./routes/agent.routes.js";
import { AgentRegistry } from "./services/agent-registry.js";
import { AgentOrchestrator } from "./services/agent-orchestrator.js";
import { SessionManager } from "./services/session-manager.js";
import { WsBroadcaster } from "./services/ws-broadcaster.js";
import { setupWebSocket } from "./server/setup-websocket.js";

export interface BootstrapOptions {
  serveStatic: boolean;
}

/**
 * Bootstrap the application — create server, wire services, start listening.
 */
export async function bootstrap(options: BootstrapOptions) {
  logger.info({ env: env.NODE_ENV }, "Bootstrapping Crow Central Agency");

  // Initialize services
  const registry = new AgentRegistry(env.CROW_SYSTEM_PATH);
  await registry.initialize();

  const orchestrator = new AgentOrchestrator(registry, env.CROW_SYSTEM_PATH);
  await orchestrator.initialize();

  const sessionManager = new SessionManager();
  const broadcaster = new WsBroadcaster();

  // Wire registry events → broadcaster
  registry.on("agentUpdated", ({ agent }) => {
    broadcaster.broadcast(agent.id, {
      type: "agent_updated",
      agentId: agent.id,
      config: agent,
    });
  });

  registry.on("agentDeleted", ({ agentId }) => {
    broadcaster.removeAgent(agentId);
  });

  // Wire orchestrator events → broadcaster
  orchestrator.on("agentMessage", ({ agentId, message }) => {
    broadcaster.broadcast(agentId, message);
  });

  orchestrator.on("agentStatus", ({ agentId, status }) => {
    broadcaster.broadcast(agentId, {
      type: "agent_status",
      agentId,
      status,
    });
  });

  // Create Fastify server
  const server = await createServer({ serveStatic: options.serveStatic });

  // Register WebSocket + routes
  await setupWebSocket(server, broadcaster, orchestrator);
  await registerHealthRoutes(server);
  await registerAgentRoutes(server, registry, orchestrator, sessionManager);

  // Start listening
  await server.listen({ host: env.HOST, port: env.PORT });
  logger.info({ host: env.HOST, port: env.PORT, static: options.serveStatic }, "Server started");

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}
