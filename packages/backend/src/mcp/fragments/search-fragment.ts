import { z } from "zod";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { DocumentSearchService } from "../../services/search/document-search-service.js";
import { DATA_SOURCE_TYPE, type DocumentSearchHit } from "../../services/search/document-search-service.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { READ_FRAGMENT_TOOL_NAME } from "./read-fragment.js";

const SEARCH_FRAGMENT_LIMIT = 25;

export const SEARCH_FRAGMENT_TOOL_NAME = "search_fragment";

/**
 * Reflection-only fragment search. Unlike `search_workspace` (scoped to the caller), it searches
 * the fragments visible to the passed target agent — the reflection agent's own scope is empty.
 */
export function getSearchFragmentToolConfig(
  fragmentManager: FragmentManager,
  documentSearchService: DocumentSearchService
) {
  const inputSchema = {
    agentId: z.string().min(1).describe("The target agent whose fragment scope to search."),
    query: z
      .string()
      .min(1)
      .describe("Full-text query matched against fragment cues and bodies. Supports fuzzy and prefix matching."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ agentId, query }) => {
    try {
      const scopedFragmentIds = fragmentManager.getScopedFragmentIds(agentId);
      const hits = documentSearchService.search(query, {
        filter: (ref) => ref.dataSourceType === DATA_SOURCE_TYPE.FRAGMENT && scopedFragmentIds.has(ref.documentId),
        limit: SEARCH_FRAGMENT_LIMIT,
      });
      if (hits.length === 0) {
        return textToolResult([`No fragment matches found for query "${query}".`]);
      }

      return textToolResult([
        `Fragment search for query "${query}" (${hits.length} hits):`,
        `[Read with ${READ_FRAGMENT_TOOL_NAME}]`,
        ...hits.map(renderFragmentHit),
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to search fragments.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: SEARCH_FRAGMENT_TOOL_NAME,
    description:
      "Full-text search over the fragments visible to the given target agent, ranked by relevance. Use it to find near-duplicates or related fragments elsewhere in the target's vault.",
    inputSchema,
    handler,
  };

  return config;
}

function renderFragmentHit(hit: DocumentSearchHit): string {
  const kind = hit.tags?.length ? ` (${hit.tags.join(", ")})` : "";
  return `- Id: ${hit.documentId}${kind} Cue: ${hit.title}`;
}
