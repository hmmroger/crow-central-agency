import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Create and configure the Fastify server instance.
 * Registers CORS and WebSocket plugins. Static serving is optional (fullstack mode).
 */
export async function createServer(options: { serveStatic: boolean }) {
  const server = Fastify({
    logger: false, // We use our own pino logger
  });

  // CORS
  await server.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  // WebSocket
  const websocket = await import("@fastify/websocket");
  await server.register(websocket.default);

  // Static file serving (fullstack mode only)
  if (options.serveStatic) {
    await setupStatic(server);
  }

  return server;
}

/**
 * Configure static file serving with SPA fallback routing.
 */
async function setupStatic(server: ReturnType<typeof Fastify>) {
  const fastifyStatic = await import("@fastify/static");
  const fs = await import("node:fs");

  const staticPath = env.STATIC_PATH;

  if (!fs.existsSync(staticPath)) {
    logger.warn({ staticPath }, "Static path does not exist, skipping static file serving");
    return;
  }

  await server.register(fastifyStatic.default, {
    root: staticPath,
    prefix: "/",
    wildcard: false,
  });

  // SPA fallback — serve index.html for non-API, non-file routes
  server.setNotFoundHandler(
    async (
      request: { url: string },
      reply: {
        status: (code: number) => { send: (body: unknown) => void };
        type: (mime: string) => { sendFile: (file: string, root: string) => void };
      }
    ) => {
      if (request.url.startsWith("/api/") || request.url.startsWith("/ws")) {
        return reply.status(404).send({ success: false, error: { code: "not_found", message: "Route not found" } });
      }

      return reply.type("text/html").sendFile("index.html", staticPath);
    }
  );
}
