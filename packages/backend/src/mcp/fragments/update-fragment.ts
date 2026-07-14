import { z } from "zod";
import { ENTITY_TYPE, FRAGMENT_MAX_WORDS, RELATIONSHIP_TYPE, type Relationship } from "@crow-central-agency/shared";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { FragmentParent } from "../../services/fragment/fragment-manager.types.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { signalActiveDomain } from "./active-domain-signal.js";
import { assertFragmentAccessible } from "./fragment-tool-utils.js";
import { toFragmentParent } from "./write-fragment.js";

export const UPDATE_FRAGMENT_TOOL_NAME = "update_fragment";

async function restoreParentEdge(fragmentManager: FragmentManager, edge: Relationship, fragmentId: string) {
  if (edge.relationshipType === RELATIONSHIP_TYPE.LINK) {
    await fragmentManager.createLink(edge.sourceEntityId, fragmentId);
  } else {
    await fragmentManager.createAssociation(edge.sourceEntityId, fragmentId);
  }
}

/**
 * Compose a parent change from named-edge primitives: drop the edges the
 * fragment currently hangs under for this agent (its incoming LINKs plus the
 * agent's own ASSOCIATION anchor — other agents' sharing associations are not
 * part of the op), then add the new parent edge, which re-runs the intrinsic
 * graph invariants. A rejected add restores the removed edges so a failed move
 * leaves the graph exactly as it was. Structural move only — updatedTimestamp
 * is not bumped.
 */
export async function changeFragmentParent(
  fragmentManager: FragmentManager,
  agentId: string,
  fragmentId: string,
  newParent: FragmentParent,
  expectedUpdatedTimestamp?: number
): Promise<void> {
  const fragment = await fragmentManager.readFragment(fragmentId);
  if (expectedUpdatedTimestamp !== undefined && fragment.updatedTimestamp !== expectedUpdatedTimestamp) {
    throw new AppError(
      "Fragment was modified since it was read. Re-read the fragment and retry.",
      APP_ERROR_CODES.CONFLICT
    );
  }

  if (newParent.entityType === ENTITY_TYPE.FRAGMENT) {
    assertFragmentAccessible(fragmentManager, agentId, newParent.entityId);
  }

  const parentEdges = fragmentManager.getParentEdges(agentId, fragmentId);
  for (const edge of parentEdges) {
    if (edge.relationshipType === RELATIONSHIP_TYPE.LINK) {
      await fragmentManager.removeLink(edge.sourceEntityId, fragmentId);
    } else {
      await fragmentManager.removeAssociation(edge.sourceEntityId, fragmentId);
    }
  }

  try {
    if (newParent.entityType === ENTITY_TYPE.AGENT) {
      await fragmentManager.createAssociation(newParent.entityId, fragmentId);
    } else {
      await fragmentManager.createLink(newParent.entityId, fragmentId);
    }
  } catch (error) {
    for (const edge of parentEdges) {
      await restoreParentEdge(fragmentManager, edge, fragmentId);
    }

    throw error;
  }
}

export function getUpdateFragmentToolConfig(
  agentId: string,
  fragmentManager: FragmentManager,
  runtimeManager: AgentRuntimeManager
) {
  const inputSchema = {
    id: z.string().min(1).describe("Fragment id to update."),
    cue: z.string().min(1).optional().describe("New cue."),
    body: z.string().min(1).optional().describe(`New body, at most ${FRAGMENT_MAX_WORDS} words.`),
    parent: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Re-link: move the fragment under this node (your own agent id or a fragment id), replacing its current parent."
      ),
    version: z
      .number()
      .optional()
      .describe(
        "The Version value from your most recent read of this fragment; the update is rejected if it changed since."
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ id, cue, body, parent, version }) => {
    try {
      if (cue === undefined && body === undefined && parent === undefined) {
        throw new Error("Provide at least one of cue, body, or parent.");
      }

      assertFragmentAccessible(fragmentManager, agentId, id);

      const changes: string[] = [];
      // Re-link first: it validates against the same version and does not bump it,
      // so a combined relink + content update stays a single consistent operation
      if (parent !== undefined) {
        await changeFragmentParent(fragmentManager, agentId, id, toFragmentParent(agentId, parent), version);
        changes.push("re-linked");
      }

      if (cue !== undefined || body !== undefined) {
        await fragmentManager.updateFragment(id, {
          cue,
          body,
          expectedUpdatedTimestamp: version,
        });
        changes.push(cue !== undefined ? "cue" : "", body !== undefined ? "body" : "");
      }

      await signalActiveDomain(agentId, id, fragmentManager, runtimeManager);
      const changeNote = changes.filter((change) => change.length > 0).join(", ");

      return textToolResult([
        `Fragment updated: ${id} (${changeNote}). Re-read the fragment before the next update; Version is now stale.`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to update fragment.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: UPDATE_FRAGMENT_TOOL_NAME,
    description:
      "Modify a fragment's cue/body and/or move it under a new parent. Pass the Version from your last read to guard against concurrent changes to shared fragments.",
    inputSchema,
    handler,
  };

  return config;
}
