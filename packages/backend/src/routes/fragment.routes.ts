import type { FastifyInstance } from "fastify";
import type { FragmentManager } from "../services/fragment/fragment-manager.js";

/**
 * Register fragment read routes. Fragment relationship edits go through the
 * general /api/relationships routes; this module only exposes reads.
 */
export async function registerFragmentRoutes(server: FastifyInstance, fragmentManager: FragmentManager) {
  /** Read a single full fragment (cue, body, usage, timestamps) */
  server.get<{ Params: { id: string } }>("/api/fragments/:id", async (request) => {
    const fragment = await fragmentManager.readFragment(request.params.id);

    return { success: true, data: fragment };
  });
}
