import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { createServer } from "./server/create-server.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerAgentRoutes } from "./routes/agent.routes.js";
import { AgentRegistry } from "./services/agent-registry.js";
import { AgentOrchestrator } from "./services/agent-orchestrator.js";
import { SessionManager } from "./services/session-manager.js";
import { WsBroadcaster } from "./services/ws-broadcaster.js";
import { PermissionHandler } from "./services/permission-handler.js";
import { ArtifactManager } from "./services/artifact-manager.js";
import { setupWebSocket } from "./server/setup-websocket.js";
import { registerArtifactRoutes } from "./routes/artifact.routes.js";
import { createArtifactsMcpServer } from "./mcp/artifacts-mcp-server.js";
import { createAgentsMcpServer } from "./mcp/agents-mcp-server.js";
import { LoopScheduler } from "./services/loop-scheduler.js";
import { OpenAIProvider } from "./services/openai-provider.js";
import { MdGenerationService } from "./services/md-generation-service.js";
import { registerGenerationRoutes } from "./routes/generation.routes.js";

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
  const permissionHandler = new PermissionHandler();
  const artifactManager = new ArtifactManager(env.CROW_SYSTEM_PATH);

  // Wire handlers into orchestrator
  orchestrator.setPermissionHandler(permissionHandler);
  orchestrator.setArtifactManager(artifactManager);

  // Register MCP server factories on orchestrator
  orchestrator.registerMcpServer("crow-artifacts", (agentId) => createArtifactsMcpServer(agentId, artifactManager));
  orchestrator.registerMcpServer("crow-agents", (agentId) => createAgentsMcpServer(agentId, orchestrator, registry));

  // Wire permission events → broadcaster
  permissionHandler.on("permissionRequest", ({ agentId, toolUseId, toolName, input, decisionReason }) => {
    broadcaster.broadcast(agentId, {
      type: "permission_request",
      agentId,
      toolUseId,
      toolName,
      input,
      decisionReason,
    });
  });

  permissionHandler.on("permissionCancelled", ({ agentId, toolUseId }) => {
    broadcaster.broadcast(agentId, {
      type: "permission_cancelled",
      agentId,
      toolUseId,
    });
  });

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

  // Loop scheduler
  const loopScheduler = new LoopScheduler(registry);

  loopScheduler.on("loopTick", ({ agentId, prompt }) => {
    orchestrator.sendMessage(agentId, prompt).catch((error) => {
      logger.error({ agentId, error }, "Loop tick failed");
    });
  });

  loopScheduler.start();

  // Cleanup on agent deletion
  registry.on("agentDeleted", ({ agentId }) => {
    loopScheduler.removeAgent(agentId);
  });

  // Conditionally initialize generation service (requires OPENAI config)
  let generationService: MdGenerationService | undefined;

  if (env.OPENAI) {
    const openaiProvider = new OpenAIProvider({ baseURL: env.OPENAI.baseURL, apiKey: env.OPENAI.apiKey });
    generationService = new MdGenerationService(openaiProvider, env.OPENAI.model ?? "gpt-4o");
    logger.info("Generation service initialized");
  }

  // Create Fastify server
  const server = await createServer({ serveStatic: options.serveStatic });

  // Register WebSocket + routes
  await setupWebSocket(server, broadcaster, orchestrator, permissionHandler);
  await registerHealthRoutes(server);
  await registerAgentRoutes(server, registry, orchestrator, sessionManager);
  await registerArtifactRoutes(server, artifactManager);
  await registerGenerationRoutes(server, registry, generationService);

  // Start listening
  await server.listen({ host: env.HOST, port: env.PORT });
  logger.info({ host: env.HOST, port: env.PORT, static: options.serveStatic }, "Server started");

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    loopScheduler.stop();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}
