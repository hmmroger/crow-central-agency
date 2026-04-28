import { assertRequiredEnv, env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { createServer } from "./server/create-server.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerSystemRoutes } from "./routes/system.routes.js";
import { registerAgentRoutes } from "./routes/agent.routes.js";
import { AgentRegistry } from "./services/agent-registry.js";
import { AgentRuntimeManager } from "./services/runtime/agent-runtime-manager.js";
import { SessionManager } from "./services/session/session-manager.js";
import { WsBroadcaster } from "./services/ws-broadcaster.js";
import { ArtifactManager } from "./services/artifact/artifact-manager.js";
import { setupWebSocket } from "./server/setup-websocket.js";
import { registerArtifactRoutes } from "./routes/artifact.routes.js";
import { ARTIFACTS_MCP_SERVER_NAME, createArtifactsMcpServer } from "./mcp/artifacts/artifacts-mcp-server.js";
import { createAgentsMcpServer, CROW_AGENTS_MCP_SERVER_NAME } from "./mcp/agents/agents-mcp-server.js";
import { createSuperAgentMcpServer, CROW_SUPER_AGENT_MCP_SERVER_NAME } from "./mcp/agents/super-agent-mcp-server.js";
import { createTasksMcpServer, CROW_TASKS_MCP_SERVER_NAME } from "./mcp/tasks/tasks-mcp-server.js";
import { createSuperTasksMcpServer, CROW_SUPER_TASKS_MCP_SERVER_NAME } from "./mcp/tasks/super-tasks-mcp-server.js";
import { REMINDERS_MCP_SERVER_NAME, createRemindersMcpServer } from "./mcp/reminders/reminders-mcp-server.js";
import { CROW_SYSTEM_AGENT_ID, CROW_TASK_DISPATCHER_AGENT_ID } from "@crow-central-agency/shared";
import { FileObjectStoreProvider } from "./core/store/file-object-store-provider.js";
import { CrowScheduler } from "./services/crow-scheduler.js";
import { SystemSettingsManager } from "./services/system-settings-manager.js";
import { MessageQueueManager } from "./services/message-queue-manager.js";
import { AgentTaskManager } from "./services/agent-task-manager.js";
import { registerGenerationRoutes } from "./routes/generation.routes.js";
import { registerTaskRoutes } from "./routes/task.routes.js";
import { CrowMcpManager } from "./mcp/crow-mcp-manager.js";
import { registerMcpRoutes } from "./routes/mcp.routes.js";
import { registerSensorRoutes } from "./routes/sensor.routes.js";
import { ensureDir } from "./utils/fs-utils.js";
import path from "path";
import { SYSTEM_AGENTS_PROJECT_DIR_NAME, DEFAULT_PROJECT_DIR_NAME } from "./config/constants.js";
import { RoutineManager } from "./routines/routine-manager.js";
import { shutdownTelemetry } from "./telemetry/setup.js";
import { createInterAgentTaskRoutine } from "./routines/inter-agent-task-routine.js";
import { createTaskDispatchRoutine } from "./routines/task-dispatch-routine.js";
import { createAgentLoopRoutine } from "./routines/agent-loop-routine.js";
import { createAgentReminderRoutine } from "./routines/agent-reminder-routine.js";
import { createFeedCleanupRoutine } from "./routines/feed-cleanup-routine.js";
import { createFeedNewItemsRoutine } from "./routines/feed-new-items-routine.js";
import { SensorManager } from "./sensors/sensor-manager.js";
import { GeoLocationSensor } from "./sensors/geolocation-sensor.js";
import { WeatherSensor } from "./sensors/weather-sensor.js";
import { AgentCircleManager } from "./services/agent-circle-manager.js";
import { registerCircleRoutes } from "./routes/circle.routes.js";
import { registerGraphRoutes } from "./routes/graph.routes.js";
import { DiscordBotManager } from "./bot-connectors/discord/discord-bot-manager.js";
import { createDiscordRoutine } from "./routines/discord-routine.js";
import { FolderFileStoreProvider } from "./core/store/folder-file-store-provider.js";
import { SimplyFeedManager } from "./feed/simply-feed-manager.js";
import { registerFeedRoutes } from "./routes/feed.routes.js";
import { registerSystemSettingsRoutes } from "./routes/system-settings.routes.js";
import { createFeedMcpServer, FEED_MCP_SERVER_NAME } from "./mcp/feed/feed-mcp-server.js";
import { createAudioMcpServer, CROW_AUDIO_MCP_SERVER_NAME } from "./mcp/audio/audio-mcp-server.js";

export interface BootstrapOptions {
  serveStatic: boolean;
}

/**
 * Bootstrap the application - create services with constructor deps, start server.
 * No event wiring here - services own their own listeners.
 */
export async function bootstrap(options: BootstrapOptions) {
  assertRequiredEnv();
  logger.info({ env: env.NODE_ENV }, "Bootstrapping Crow Central Agency");

  await ensureDir(path.join(env.CROW_SYSTEM_PATH, SYSTEM_AGENTS_PROJECT_DIR_NAME));
  await ensureDir(path.join(env.CROW_SYSTEM_PATH, DEFAULT_PROJECT_DIR_NAME));

  // Create services - order matters for dependency graph
  const broadcaster = new WsBroadcaster();
  const folderFileProvider = new FolderFileStoreProvider(env.CROW_SYSTEM_PATH);
  const storeProvider = new FileObjectStoreProvider(env.CROW_SYSTEM_PATH);
  const systemSettingsManager = new SystemSettingsManager(storeProvider);
  const circleManager = new AgentCircleManager(storeProvider, broadcaster);
  await circleManager.initialize();
  const registry = new AgentRegistry(storeProvider, folderFileProvider, broadcaster, circleManager);
  await registry.initialize();
  const crowScheduler = new CrowScheduler(storeProvider, registry);
  await crowScheduler.initialize();
  const taskManager = new AgentTaskManager(storeProvider, broadcaster, circleManager);
  await taskManager.initialize();
  const feedManager = new SimplyFeedManager(storeProvider, folderFileProvider, crowScheduler);
  const artifactManager = new ArtifactManager(storeProvider, registry, circleManager);
  await artifactManager.initialize();

  const sessionManager = new SessionManager(storeProvider);
  const messageQueue = new MessageQueueManager();
  const mcpManager = new CrowMcpManager(storeProvider, systemSettingsManager, registry);
  await mcpManager.initialize();
  const sensorManager = new SensorManager(storeProvider);
  sensorManager.registerSensor(new GeoLocationSensor());
  sensorManager.registerSensor(new WeatherSensor());

  const runtimeManager = new AgentRuntimeManager(
    storeProvider,
    broadcaster,
    registry,
    mcpManager,
    sessionManager,
    messageQueue,
    taskManager,
    sensorManager,
    circleManager
  );
  await runtimeManager.initialize();

  const routineManager = new RoutineManager(registry, runtimeManager, taskManager, crowScheduler, feedManager);
  const interAgentRoutine = createInterAgentTaskRoutine(registry, runtimeManager, taskManager);
  routineManager.addRoutine(interAgentRoutine);
  const taskDispatchRoutine = createTaskDispatchRoutine(runtimeManager);
  routineManager.addRoutine(taskDispatchRoutine);
  const agentLoopRoutine = createAgentLoopRoutine(taskManager);
  routineManager.addRoutine(agentLoopRoutine);
  const agentReminderRoutine = createAgentReminderRoutine(taskManager);
  routineManager.addRoutine(agentReminderRoutine);
  const feedCleanupRoutine = createFeedCleanupRoutine(registry, systemSettingsManager);
  routineManager.addRoutine(feedCleanupRoutine);
  const feedNewItemsRoutine = createFeedNewItemsRoutine(registry, taskManager, systemSettingsManager);
  routineManager.addRoutine(feedNewItemsRoutine);

  // Discord bot manager — creates per-agent bots for agents with discordConfig
  const discordBotManager = new DiscordBotManager(registry, runtimeManager);
  await discordBotManager.initialize();
  const discordRoutine = createDiscordRoutine(discordBotManager, runtimeManager);
  routineManager.addRoutine(discordRoutine);

  // Register MCP server factories
  mcpManager.registerMcpServer(ARTIFACTS_MCP_SERVER_NAME, (agentId) =>
    createArtifactsMcpServer(agentId, artifactManager, registry, circleManager, sensorManager)
  );
  mcpManager.registerMcpServer(CROW_AGENTS_MCP_SERVER_NAME, (agentId) =>
    createAgentsMcpServer(agentId, registry, runtimeManager, taskManager)
  );
  mcpManager.registerMcpServer(CROW_TASKS_MCP_SERVER_NAME, (agentId) =>
    createTasksMcpServer(agentId, taskManager, circleManager, sensorManager)
  );
  mcpManager.registerMcpServer(FEED_MCP_SERVER_NAME, (agentId) =>
    createFeedMcpServer(agentId, registry, feedManager, sensorManager, systemSettingsManager)
  );
  mcpManager.registerMcpServer(CROW_AUDIO_MCP_SERVER_NAME, (agentId) =>
    createAudioMcpServer(agentId, registry, artifactManager)
  );
  mcpManager.registerMcpServer(
    CROW_SUPER_TASKS_MCP_SERVER_NAME,
    (agentId) => createSuperTasksMcpServer(agentId, taskManager, registry, circleManager, sensorManager),
    [CROW_SYSTEM_AGENT_ID, CROW_TASK_DISPATCHER_AGENT_ID]
  );
  mcpManager.registerMcpServer(
    CROW_SUPER_AGENT_MCP_SERVER_NAME,
    (agentId) => createSuperAgentMcpServer(agentId, registry, runtimeManager, sessionManager),
    [CROW_SYSTEM_AGENT_ID]
  );
  mcpManager.registerMcpServer(REMINDERS_MCP_SERVER_NAME, (agentId) =>
    createRemindersMcpServer(agentId, crowScheduler, sensorManager)
  );

  // Start scheduler
  crowScheduler.start();

  // Create Fastify server
  const server = await createServer({ serveStatic: options.serveStatic });

  // Register WebSocket + routes
  await setupWebSocket(server, broadcaster, runtimeManager);
  await registerAuthRoutes(server);
  await registerHealthRoutes(server);
  await registerSystemRoutes(server);
  await registerAgentRoutes(server, registry, runtimeManager, sessionManager, storeProvider);
  await registerArtifactRoutes(server, artifactManager);
  await registerTaskRoutes(server, taskManager, registry);
  await registerGenerationRoutes(server);
  await registerMcpRoutes(server, mcpManager);
  await registerSensorRoutes(server, sensorManager);
  await registerCircleRoutes(server, circleManager, registry);
  await registerGraphRoutes(server, circleManager, registry, runtimeManager);
  await registerFeedRoutes(server, feedManager);
  await registerSystemSettingsRoutes(server, systemSettingsManager);

  // Start listening
  await server.listen({ host: env.HOST, port: env.PORT });
  logger.info({ host: env.HOST, port: env.PORT, static: options.serveStatic }, "Server started");

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    crowScheduler.stop();
    await discordBotManager.destroy();
    await server.close();
    await shutdownTelemetry();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}
