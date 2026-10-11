import type { FastifyInstance } from "fastify";
import { TagSnapshotQuerySchema } from "@crow-central-agency/shared";
import type { TagManager } from "../services/tag/tag-manager.js";
import { wrapZodError } from "./route-utils.js";

/**
 * Register tag REST routes.
 */
export async function registerTagRoutes(server: FastifyInstance, tagManager: TagManager) {
  /** Tag snapshot, optionally narrowed to one entity type's edges and the tags they use */
  server.get<{ Querystring: unknown }>("/api/tags", async (request) => {
    try {
      const { entityType } = TagSnapshotQuerySchema.parse(request.query);

      return { success: true, data: tagManager.getSnapshot(entityType) };
    } catch (error) {
      return wrapZodError(error);
    }
  });
}
