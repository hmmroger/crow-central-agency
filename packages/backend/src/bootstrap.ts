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
import { MessageQueueManager } from "./services/message-queue-manager.js";
import { OpenAIProvider } from "./model-providers/openai-provider.js";
import { MdGenerationService } from "./services/md-generation-service.js";
import { registerGenerationRoutes } from "./routes/generation.routes.js";

export interface BootstrapOptions {
  serveStatic: boolean;
}

/**
 * Bootstrap the application — create services with constructor deps, start server.
 * No event wiring here — services own their own listeners.
 */
export async function bootstrap(options: BootstrapOptions) {
  logger.info({ env: env.NODE_ENV }, "Bootstrapping Crow Central Agency");

  // Create services — order matters for dependency graph
  const broadcaster = new WsBroadcaster();
  const registry = new AgentRegistry(broadcaster);
  await registry.initialize();

  const sessionManager = new SessionManager();
  const permissionHandler = new PermissionHandler(broadcaster);
  const artifactManager = new ArtifactManager();
  const loopScheduler = new LoopScheduler(registry);
  const messageQueue = new MessageQueueManager();

  const orchestrator = new AgentOrchestrator(
    registry,
    broadcaster,
    permissionHandler,
    artifactManager,
    loopScheduler,
    sessionManager,
    messageQueue
  );
  await orchestrator.initialize();

  // Register MCP server factories on orchestrator
  orchestrator.registerMcpServer("crow-artifacts", (agentId) =>
    createArtifactsMcpServer(agentId, artifactManager, registry)
  );
  orchestrator.registerMcpServer("crow-agents", (agentId) => createAgentsMcpServer(agentId, orchestrator, registry));

  // Start loop scheduler
  loopScheduler.start();

  // Conditionally create generation service (requires OPENAI config)
  let generationService: MdGenerationService | undefined;

  if (env.OPENAI) {
    const openaiProvider = new OpenAIProvider({ baseUrl: env.OPENAI.baseUrl, apiKey: env.OPENAI.apiKey });
    generationService = new MdGenerationService(openaiProvider, env.OPENAI.model ?? "gpt-5-mini");
    logger.info("Generation service initialized");
  }

  // Create Fastify server
  const server = await createServer({ serveStatic: options.serveStatic });

  // Register WebSocket + routes
  await setupWebSocket(server, broadcaster, orchestrator, permissionHandler);
  await registerHealthRoutes(server);
  await registerAgentRoutes(server, registry, orchestrator, sessionManager);
  await registerArtifactRoutes(server, artifactManager);
  await registerGenerationRoutes(server, generationService);

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
