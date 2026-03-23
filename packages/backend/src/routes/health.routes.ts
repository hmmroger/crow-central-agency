import type { FastifyInstance } from "fastify";

/**
 * Register health check routes
 */
export async function registerHealthRoutes(server: FastifyInstance) {
  server.get("/api/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });
}
