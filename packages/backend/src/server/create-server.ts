import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { registerErrorHandler } from "./error-handler.js";
import { registerAuthHook } from "./auth-hook.js";
import { registerRequestContextHook } from "./request-context-hook.js";
import { fastifyOtelInstrumentation } from "../telemetry/setup.js";

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

  // OpenTelemetry — must be registered before routes for full instrumentation coverage
  if (fastifyOtelInstrumentation) {
    await server.register(fastifyOtelInstrumentation.plugin());
  }

  // WebSocket
  const websocket = await import("@fastify/websocket");
  await server.register(websocket.default);

  // Auth hook — validates access key for /api/ routes
  registerAuthHook(server);

  // Request context — populates AsyncLocalStorage with per-request data (timezone)
  registerRequestContextHook(server);

  // Error handler - maps AppError → HTTP status
  registerErrorHandler(server);

  // Static file serving (fullstack mode only)
  if (options.serveStatic) {
    await setupStatic(server);
  }

  return server;
}

/**
 * Configure static file serving with SPA fallback routing.
 */
async function setupStatic(server: FastifyInstance) {
  const fastifyStatic = await import("@fastify/static");
  const { access } = await import("node:fs/promises");

  const staticPath = env.STATIC_PATH;

  try {
    await access(staticPath);
  } catch {
    logger.warn({ staticPath }, "Static path does not exist, skipping static file serving");

    return;
  }

  await server.register(fastifyStatic.default, {
    root: staticPath,
    prefix: "/",
    wildcard: false,
  });

  // SPA fallback - serve index.html for non-API, non-file routes
  server.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith("/api/") || request.url.startsWith("/ws")) {
      return reply.status(404).send({ success: false, error: { code: "not_found", message: "Route not found" } });
    }

    return reply.type("text/html").sendFile("index.html", staticPath);
  });
}
