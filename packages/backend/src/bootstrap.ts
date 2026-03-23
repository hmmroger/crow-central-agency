import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { createServer } from "./server/create-server.js";
import { registerHealthRoutes } from "./routes/health.routes.js";

export interface BootstrapOptions {
  serveStatic: boolean;
}

/**
 * Bootstrap the application — create server, wire services, start listening.
 */
export async function bootstrap(options: BootstrapOptions) {
  logger.info({ env: env.NODE_ENV }, "Bootstrapping Crow Central Agency");

  // Create Fastify server
  const server = await createServer({ serveStatic: options.serveStatic });

  // Register routes
  await registerHealthRoutes(server);

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
