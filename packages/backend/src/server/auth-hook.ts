import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { logger } from "../utils/logger.js";
import { timingSafeCompare } from "./auth-utils.js";

const log = logger.child({ context: "auth" });

const BEARER_PREFIX = "Bearer ";

/** Routes that do not require authentication */
const PUBLIC_ROUTES = new Set(["/api/health"]);

/**
 * Register a Fastify onRequest hook that validates the access key.
 * Protects all `/api/` routes except those in PUBLIC_ROUTES.
 * WebSocket auth is handled separately in setup-websocket.ts.
 */
export function registerAuthHook(server: FastifyInstance): void {
  server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Only protect /api/ routes — static files and other paths pass through
    if (!request.url.startsWith("/api/")) {
      return;
    }

    // Allow public routes
    const routePath = request.url.split("?")[0];
    if (PUBLIC_ROUTES.has(routePath)) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
      log.warn({ url: request.url }, "Missing or malformed Authorization header");
      return reply.status(401).send({
        success: false,
        error: { code: APP_ERROR_CODES.UNAUTHORIZED, message: "Missing or invalid access key" },
      });
    }

    const providedKey = authHeader.slice(BEARER_PREFIX.length);
    if (!timingSafeCompare(providedKey, env.ACCESS_KEY)) {
      log.warn({ url: request.url }, "Invalid access key");
      return reply.status(401).send({
        success: false,
        error: { code: APP_ERROR_CODES.UNAUTHORIZED, message: "Missing or invalid access key" },
      });
    }
  });
}
