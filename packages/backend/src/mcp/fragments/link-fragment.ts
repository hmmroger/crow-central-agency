import { z } from "zod";
import { ENTITY_TYPE } from "@crow-central-agency/shared";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { signalActiveDomain } from "./active-domain-signal.js";
import { assertFragmentAccessible } from "./fragment-tool-utils.js";
import { toFragmentParent } from "./write-fragment.js";

export const LINK_FRAGMENT_TOOL_NAME = "link_fragment";

/**
 * Add a target→fragment edge, optionally consuming one named original edge (a move).
 * The new edge is created first so a rejected add (kind matrix, acyclicity) leaves the
 * graph untouched; if the original removal then fails, the added edge is rolled back.
 */
export async function linkFragment(
  fragmentManager: FragmentManager,
  agentId: string,
  fragmentId: string,
  targetId: string,
  originalId?: string
): Promise<void> {
  assertFragmentAccessible(fragmentManager, agentId, fragmentId);

  const target = toFragmentParent(agentId, targetId);
  if (target.entityType === ENTITY_TYPE.FRAGMENT) {
    assertFragmentAccessible(fragmentManager, agentId, target.entityId);
  }

  const original = originalId === undefined ? undefined : toFragmentParent(agentId, originalId);
  if (original !== undefined && original.entityType === ENTITY_TYPE.FRAGMENT) {
    assertFragmentAccessible(fragmentManager, agentId, original.entityId);
  }

  if (target.entityType === ENTITY_TYPE.AGENT) {
    await fragmentManager.createAssociation(target.entityId, fragmentId);
  } else {
    await fragmentManager.createLink(target.entityId, fragmentId);
  }

  if (original === undefined) {
    return;
  }

  try {
    if (original.entityType === ENTITY_TYPE.AGENT) {
      await fragmentManager.removeAssociation(original.entityId, fragmentId);
    } else {
      await fragmentManager.removeLink(original.entityId, fragmentId);
    }
  } catch (error) {
    // roll back the added edge so a failed move leaves the graph untouched
    if (target.entityType === ENTITY_TYPE.AGENT) {
      await fragmentManager.removeAssociation(target.entityId, fragmentId);
    } else {
      await fragmentManager.removeLink(target.entityId, fragmentId);
    }

    throw error;
  }
}

export function getLinkFragmentToolConfig(
  agentId: string,
  fragmentManager: FragmentManager,
  runtimeManager: AgentRuntimeManager
) {
  const inputSchema = {
    fragmentId: z.string().min(1).describe("Fragment id to link."),
    target: z
      .string()
      .min(1)
      .describe(
        "The node to link the fragment under: your own agent id for a top-level anchor, or an existing fragment id."
      ),
    original: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Optional current parent to move away from (your own agent id or a fragment id); its edge to the fragment is removed once the new link is in place. Omit to just add another parent."
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ fragmentId, target, original }) => {
    try {
      await linkFragment(fragmentManager, agentId, fragmentId, target, original);

      await signalActiveDomain(agentId, fragmentId, fragmentManager, runtimeManager);

      const action = original === undefined ? `linked under ${target}` : `moved from ${original} to ${target}`;

      return textToolResult([`Fragment ${fragmentId} ${action}.`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to link fragment.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LINK_FRAGMENT_TOOL_NAME,
    description:
      "Link a fragment under a new parent — your own agent id or another fragment. Pass original to move it (the old edge is removed atomically); omit original to give it an additional parent.",
    inputSchema,
    handler,
  };

  return config;
}
