import type { FastifyInstance } from "fastify";
import type { TagManager } from "../services/tag/tag-manager.js";

/**
 * Register tag REST routes.
 */
export async function registerTagRoutes(server: FastifyInstance, tagManager: TagManager) {
  /** Every tag record; tagged entities are read through GET /api/relationships */
  server.get("/api/tags", async () => {
    return { success: true, data: tagManager.getAllTags() };
  });
}
