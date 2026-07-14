import { z } from "zod";
import { ENTITY_TYPE } from "@crow-central-agency/shared";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { assertFragmentAccessible } from "./fragment-tool-utils.js";
import { toFragmentParent } from "./write-fragment.js";

/** The slice of AgentRuntimeManager the unlink flow needs: dropping collected ids from the acting agent's active set */
export interface ActiveDomainManager {
  clearActiveDomain(agentId: string, deletedFragmentId: string): Promise<void>;
}

export const UNLINK_FRAGMENT_TOOL_NAME = "unlink_fragment";

/**
 * Remove one named source→fragment edge; orphaned fragments are cascade-collected
 * by the manager and cleared from the acting agent's active domain set.
 */
export async function unlinkFragmentEdge(
  fragmentManager: FragmentManager,
  runtimeManager: ActiveDomainManager,
  agentId: string,
  fragmentId: string,
  sourceId: string
): Promise<string[]> {
  assertFragmentAccessible(fragmentManager, agentId, fragmentId);

  const source = toFragmentParent(agentId, sourceId);
  if (source.entityType === ENTITY_TYPE.FRAGMENT) {
    assertFragmentAccessible(fragmentManager, agentId, source.entityId);
  }

  const collectedIds = await fragmentManager.unlinkFragment(source, fragmentId);
  for (const collectedId of collectedIds) {
    await runtimeManager.clearActiveDomain(agentId, collectedId);
  }

  return collectedIds;
}

export function getUnlinkFragmentToolConfig(
  agentId: string,
  fragmentManager: FragmentManager,
  runtimeManager: ActiveDomainManager
) {
  const inputSchema = {
    fragmentId: z.string().min(1).describe("Fragment id to unlink."),
    source: z
      .string()
      .min(1)
      .describe("The parent whose edge to remove: your own agent id or a fragment id currently linking to it."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ fragmentId, source }) => {
    try {
      const collectedIds = await unlinkFragmentEdge(fragmentManager, runtimeManager, agentId, fragmentId, source);

      if (collectedIds.length === 0) {
        return textToolResult([`Unlinked ${fragmentId} from ${source}; the fragment remains reachable elsewhere.`]);
      }

      return textToolResult([
        `Unlinked ${fragmentId} from ${source}; ${collectedIds.length} orphaned fragment(s) deleted: ${collectedIds.join(", ")}.`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to unlink fragment.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: UNLINK_FRAGMENT_TOOL_NAME,
    description:
      "Remove one parent edge from a fragment. If that was its last incoming edge, the fragment is deleted and any of its children left unreachable are cascade-deleted too.",
    inputSchema,
    handler,
  };

  return config;
}
