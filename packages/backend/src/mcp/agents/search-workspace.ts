import { z } from "zod";
import { ENTITY_TYPE } from "@crow-central-agency/shared";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { DocumentSearchService } from "../../services/search/document-search-service.js";
import {
  DATA_SOURCE_TYPE,
  type DataSourceType,
  type DocumentSearchFilter,
  type DocumentSearchHit,
} from "../../services/search/document-search-service.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { applyPagination, formatPaginationHeader, getErrorToolResult, textToolResult } from "../tool-utils.js";

const DEFAULT_SEARCH_LIMIT = 25;
const MAX_SEARCH_LIMIT = 200;

export const SEARCH_WORKSPACE_TOOL_NAME = "search_workspace";

const SEARCH_SOURCE_VALUES = [
  DATA_SOURCE_TYPE.ARTIFACT,
  DATA_SOURCE_TYPE.CIRCLE_ARTIFACT,
  DATA_SOURCE_TYPE.TASK,
  DATA_SOURCE_TYPE.FRAGMENT,
];

export function getSearchWorkspaceToolConfig(
  agentId: string,
  documentSearchService: DocumentSearchService,
  taskManager: AgentTaskManager,
  circleManager: AgentCircleManager,
  fragmentManager: FragmentManager
) {
  const inputSchema = {
    query: z
      .string()
      .min(1)
      .describe(
        "Full-text query matched against artifact filenames and contents, task titles and results, fragment cues and bodies, and tags. Supports fuzzy and prefix matching."
      ),
    sources: z
      .array(z.enum(SEARCH_SOURCE_VALUES))
      .min(1)
      .optional()
      .describe(`Restrict to specific sources. Values: ${SEARCH_SOURCE_VALUES.join(", ")}. Omit to search all.`),
    limit: z
      .number()
      .optional()
      .describe(`Maximum number of hits to return per page. Default ${DEFAULT_SEARCH_LIMIT}.`),
    offset: z.number().optional().describe("Number of hits to skip before the page starts (0-based offset)."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ query, sources, limit, offset }) => {
    try {
      const filter = buildAccessFilter(agentId, taskManager, circleManager, fragmentManager, sources);
      const hits = documentSearchService.search(query, { filter, limit: MAX_SEARCH_LIMIT });
      if (hits.length === 0) {
        return textToolResult([`No matches found for query "${query}".`]);
      }

      const pagination = applyPagination(hits, limit || DEFAULT_SEARCH_LIMIT, offset);
      const header = formatPaginationHeader(`Workspace search for query "${query}"`, pagination);
      return textToolResult(header.concat("", renderHits(pagination.items)));
    } catch (error) {
      return getErrorToolResult(error, "Failed to search workspace.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: SEARCH_WORKSPACE_TOOL_NAME,
    description:
      "Full-text search across your own artifacts, artifacts in circles you directly belong to, the results of tasks you own, and fragments in your vault. Supports fuzzy and prefix matching, ranked by relevance. Results are grouped by source; open a hit with the read tool named in its section.",
    inputSchema,
    handler,
  };

  return config;
}

/**
 * Build the predicate that limits results to what the agent may see: its own artifacts, artifacts
 * in circles it directly belongs to, tasks it owns, and fragments within its resolved reachable
 * scope. An optional `sources` list narrows further.
 */
function buildAccessFilter(
  agentId: string,
  taskManager: AgentTaskManager,
  circleManager: AgentCircleManager,
  fragmentManager: FragmentManager,
  sources: DataSourceType[] | undefined
): DocumentSearchFilter {
  const memberCircleIds = new Set(
    circleManager.getCirclesForEntity(agentId, ENTITY_TYPE.AGENT).map((circle) => circle.id)
  );
  const ownedTaskIds = new Set(taskManager.getTasksByOwner(agentId).map((task) => task.id));
  const scopedFragmentIds = fragmentManager.getScopedFragmentIds(agentId);
  const allowedSources = sources ? new Set<DataSourceType>(sources) : undefined;

  return (ref) => {
    if (allowedSources && !allowedSources.has(ref.dataSourceType)) {
      return false;
    }

    switch (ref.dataSourceType) {
      case DATA_SOURCE_TYPE.ARTIFACT:
        return ref.provenanceId === agentId;

      case DATA_SOURCE_TYPE.CIRCLE_ARTIFACT:
        return memberCircleIds.has(ref.provenanceId);

      case DATA_SOURCE_TYPE.TASK:
        return ownedTaskIds.has(ref.documentId);

      case DATA_SOURCE_TYPE.FRAGMENT:
        return scopedFragmentIds.has(ref.documentId);

      default:
        return false;
    }
  };
}

function renderHits(hits: DocumentSearchHit[]): string[] {
  const artifactHits = hits.filter(
    (hit) => hit.dataSourceType === DATA_SOURCE_TYPE.ARTIFACT || hit.dataSourceType === DATA_SOURCE_TYPE.CIRCLE_ARTIFACT
  );
  const taskHits = hits.filter((hit) => hit.dataSourceType === DATA_SOURCE_TYPE.TASK);
  const fragmentHits = hits.filter((hit) => hit.dataSourceType === DATA_SOURCE_TYPE.FRAGMENT);

  const sections: string[][] = [];
  if (artifactHits.length > 0) {
    sections.push([
      "Artifacts:",
      "[Read with read_artifact, or read_circle_artifact for hits showing a circleId]",
      ...artifactHits.map(renderArtifactHit),
    ]);
  }

  if (taskHits.length > 0) {
    sections.push(["Tasks:", "[Read with get_task_result]", ...taskHits.map(renderTaskHit)]);
  }

  if (fragmentHits.length > 0) {
    sections.push(["Fragments:", "[Read with read_fragment]", ...fragmentHits.map(renderFragmentHit)]);
  }

  const lines: string[] = [];
  for (const section of sections) {
    if (lines.length > 0) {
      lines.push("");
    }

    lines.push(...section);
  }

  return lines;
}

function renderArtifactHit(hit: DocumentSearchHit): string {
  const circle = hit.dataSourceType === DATA_SOURCE_TYPE.CIRCLE_ARTIFACT ? ` circleId: ${hit.provenanceId}` : "";
  const tags = hit.tags?.length ? ` tags: [${hit.tags.join(", ")}]` : "";
  return `- Filename: ${hit.title}${circle}${tags}`;
}

function renderTaskHit(hit: DocumentSearchHit): string {
  return `- Id: ${hit.documentId} Title: ${hit.title}`;
}

function renderFragmentHit(hit: DocumentSearchHit): string {
  const kind = hit.tags?.length ? ` (${hit.tags.join(", ")})` : "";
  return `- Id: ${hit.documentId}${kind} Cue: ${hit.title}`;
}
