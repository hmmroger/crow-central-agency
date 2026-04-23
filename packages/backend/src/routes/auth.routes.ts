import type { FastifyInstance } from "fastify";

/**
 * Register authentication routes.
 * GET /api/auth/verify is protected by the auth hook — returns success if the access key is valid.
 */
export async function registerAuthRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/auth/verify", async () => {
    return { success: true, data: { ok: true } };
  });
}
