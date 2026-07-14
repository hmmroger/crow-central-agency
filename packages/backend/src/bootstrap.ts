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
import { CopilotClientManager } from "./services/copilot/copilot-client-manager.js";
import { WsBroadcaster } from "./services/ws-broadcaster.js";
import { ArtifactManager } from "./services/artifact/artifact-manager.js";
import { DocumentSearchService } from "./services/search/document-search-service.js";
import { PlacesManager } from "./services/places/places-manager.js";
import { setupWebSocket } from "./server/setup-websocket.js";
import { registerArtifactRoutes } from "./routes/artifact.routes.js";
import { getArtifactsMcpServerDefinition } from "./mcp/artifacts/artifacts-mcp-server.js";
import { getAgentsMcpServerDefinition } from "./mcp/agents/agents-mcp-server.js";
import { getSuperAgentMcpServerDefinition } from "./mcp/agents/super-agent-mcp-server.js";
import { getBuilderAgentMcpServerDefinition } from "./mcp/agents/builder-agent-mcp-server.js";
import { getTasksMcpServerDefinition } from "./mcp/tasks/tasks-mcp-server.js";
import { getSuperTasksMcpServerDefinition } from "./mcp/tasks/super-tasks-mcp-server.js";
import { getRemindersMcpServerDefinition } from "./mcp/reminders/reminders-mcp-server.js";
import { FileObjectStoreProvider } from "./core/store/file-object-store-provider.js";
import { CrowScheduler } from "./services/crow-scheduler.js";
import { SystemSettingsManager } from "./services/system-settings-manager.js";
import { MessageQueueManager } from "./services/message-queue-manager.js";
import { AgentTaskManager } from "./services/agent-task-manager.js";
import { registerGenerationRoutes } from "./routes/generation.routes.js";
import { registerAgentBuilderRoutes } from "./routes/agent-builder.routes.js";
import { WorldBuilderService } from "./services/world-builder/world-builder-service.js";
import { WorldBuilderDraftStore } from "./services/world-builder/world-builder-draft-store.js";
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
import { RelationshipManager } from "./services/relationship-manager.js";
import { registerCircleRoutes } from "./routes/circle.routes.js";
import { registerGraphRoutes } from "./routes/graph.routes.js";
import { DiscordBotManager } from "./bot-connectors/discord/discord-bot-manager.js";
import { createDiscordRoutine } from "./routines/discord-routine.js";
import { createGmailNotificationRoutine } from "./routines/gmail-notification-routine.js";
import { FolderFileStoreProvider } from "./core/store/folder-file-store-provider.js";
import { SimplyFeedManager } from "./feed/simply-feed-manager.js";
import { registerFeedRoutes } from "./routes/feed.routes.js";
import { registerSystemSettingsRoutes } from "./routes/system-settings.routes.js";
import { getFeedMcpServerDefinition } from "./mcp/feed/feed-mcp-server.js";
import { getAudioMcpServerDefinition } from "./mcp/audio/audio-mcp-server.js";
import { ConnectorManager } from "./connectors/connector-manager.js";
import { GoogleConnector } from "./connectors/google-connector.js";
import { registerConnectorsRoutes } from "./routes/connectors.routes.js";
import { getGmailMcpServerDefinition } from "./mcp/gmail/gmail-mcp-server.js";
import { getGoogleCalendarMcpServerDefinition } from "./mcp/google-calendar/google-calendar-mcp-server.js";
import { getGoogleContactsMcpServerDefinition } from "./mcp/google-contacts/google-contacts-mcp-server.js";
import { getPlacesMcpServerDefinition } from "./mcp/places/places-mcp-server.js";

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
  const relationshipManager = new RelationshipManager(storeProvider);
  await relationshipManager.initialize();
  const circleManager = new AgentCircleManager(storeProvider, relationshipManager, broadcaster);
  await circleManager.initialize();
  const registry = new AgentRegistry(storeProvider, folderFileProvider, broadcaster, circleManager);
  await registry.initialize();
  const crowScheduler = new CrowScheduler(storeProvider, registry);
  await crowScheduler.initialize();
  const taskManager = new AgentTaskManager(storeProvider, broadcaster, circleManager);
  await taskManager.initialize();
  const feedManager = new SimplyFeedManager(storeProvider, folderFileProvider, crowScheduler);
  await feedManager.initialize();
  const artifactManager = new ArtifactManager(storeProvider, registry, circleManager);
  await artifactManager.initialize();
  const documentSearchService = new DocumentSearchService(artifactManager, taskManager, registry, circleManager);
  await documentSearchService.initialize();
  const placesManager = new PlacesManager();
  const connectorManager = new ConnectorManager(storeProvider, registry, crowScheduler);
  connectorManager.registerConnector(new GoogleConnector());

  const copilotClientManager = new CopilotClientManager();
  await copilotClientManager.initialize();
  const sessionManager = new SessionManager(storeProvider, copilotClientManager);
  const messageQueue = new MessageQueueManager();
  const mcpManager = new CrowMcpManager(storeProvider, systemSettingsManager, registry);
  await mcpManager.initialize();
  const sensorManager = new SensorManager(storeProvider);
  sensorManager.registerSensor(new GeoLocationSensor(placesManager));
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

  const worldBuilderDraftStore = new WorldBuilderDraftStore(storeProvider);
  const worldBuilderService = new WorldBuilderService(
    runtimeManager,
    worldBuilderDraftStore,
    registry,
    circleManager,
    mcpManager,
    broadcaster
  );

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
  const gmailNotificationRoutine = createGmailNotificationRoutine(
    registry,
    taskManager,
    runtimeManager,
    connectorManager,
    sensorManager
  );
  routineManager.addRoutine(gmailNotificationRoutine);

  // Discord bot manager — creates per-agent bots for agents with discordConfig
  const discordBotManager = new DiscordBotManager(registry, runtimeManager);
  await discordBotManager.initialize();
  const discordRoutine = createDiscordRoutine(discordBotManager, runtimeManager);
  routineManager.addRoutine(discordRoutine);

  // Register built-in MCP servers
  mcpManager.registerMcpServer(
    getArtifactsMcpServerDefinition(artifactManager, registry, circleManager, sensorManager)
  );
  mcpManager.registerMcpServer(
    getAgentsMcpServerDefinition(registry, runtimeManager, taskManager, documentSearchService, circleManager)
  );
  mcpManager.registerMcpServer(getTasksMcpServerDefinition(taskManager, circleManager, sensorManager));
  mcpManager.registerMcpServer(getFeedMcpServerDefinition(registry, feedManager, sensorManager, systemSettingsManager));
  mcpManager.registerMcpServer(getAudioMcpServerDefinition(registry, artifactManager));
  mcpManager.registerMcpServer(getSuperTasksMcpServerDefinition(taskManager, registry, circleManager, sensorManager));
  mcpManager.registerMcpServer(getSuperAgentMcpServerDefinition(registry, runtimeManager, sessionManager));
  mcpManager.registerMcpServer(getBuilderAgentMcpServerDefinition(registry, mcpManager));
  mcpManager.registerMcpServer(getRemindersMcpServerDefinition(crowScheduler, sensorManager));
  mcpManager.registerMcpServer(getGmailMcpServerDefinition(connectorManager, sensorManager));
  mcpManager.registerMcpServer(getGoogleCalendarMcpServerDefinition(connectorManager, sensorManager));
  mcpManager.registerMcpServer(getGoogleContactsMcpServerDefinition(connectorManager, sensorManager));
  mcpManager.registerMcpServer(getPlacesMcpServerDefinition(placesManager));

  await runtimeManager.startRecovery();

  // Start scheduler
  crowScheduler.start();

  // Create Fastify server
  const server = await createServer({ serveStatic: options.serveStatic });

  // Register WebSocket + routes
  await setupWebSocket(server, broadcaster, runtimeManager);
  await registerAuthRoutes(server);
  await registerHealthRoutes(server);
  await registerSystemRoutes(server, copilotClientManager);
  await registerAgentRoutes(
    server,
    registry,
    runtimeManager,
    sessionManager,
    storeProvider,
    connectorManager,
    mcpManager
  );
  await registerArtifactRoutes(server, artifactManager);
  await registerTaskRoutes(server, taskManager, registry);
  await registerGenerationRoutes(server, worldBuilderService);
  await registerAgentBuilderRoutes(server, worldBuilderService);
  await registerMcpRoutes(server, mcpManager);
  await registerSensorRoutes(server, sensorManager);
  await registerCircleRoutes(server, circleManager, registry);
  await registerGraphRoutes(server, circleManager, registry, runtimeManager);
  await registerFeedRoutes(server, feedManager);
  await registerSystemSettingsRoutes(server, systemSettingsManager);
  await registerConnectorsRoutes(server, connectorManager);

  // Start listening
  await server.listen({ host: env.HOST, port: env.PORT });
  logger.info({ host: env.HOST, port: env.PORT, static: options.serveStatic }, "Server started");

  await worldBuilderService.recoverInterruptedBuild();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    crowScheduler.stop();
    await feedManager.dispose();
    await discordBotManager.destroy();
    await server.close();
    await copilotClientManager.dispose();
    await shutdownTelemetry();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}
