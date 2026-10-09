import type { FastifyInstance } from "fastify";
import { SearchQuerySchema, type DataSourceType } from "@crow-central-agency/shared";
import type { DocumentSearchService } from "../services/search/document-search-service.js";
import type { DocumentSearchFilter } from "../services/search/document-search-service.types.js";
import { wrapZodError } from "./route-utils.js";

function buildSourceFilter(sources: DataSourceType[] | undefined): DocumentSearchFilter | undefined {
  if (!sources) {
    return undefined;
  }

  const allowedSources = new Set(sources);
  return (ref) => allowedSources.has(ref.dataSourceType);
}

/**
 * Register workspace search REST routes.
 */
export async function registerSearchRoutes(server: FastifyInstance, documentSearchService: DocumentSearchService) {
  /** Ranked hits across every indexed source, optionally narrowed by `sources` */
  server.get<{ Querystring: unknown }>("/api/search", async (request) => {
    try {
      const { query, sources, limit } = SearchQuerySchema.parse(request.query);
      const hits = documentSearchService.search(query, { filter: buildSourceFilter(sources), limit });

      return { success: true, data: hits };
    } catch (error) {
      return wrapZodError(error);
    }
  });
}
