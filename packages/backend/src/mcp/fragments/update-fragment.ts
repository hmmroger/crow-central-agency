import { z } from "zod";
import { FRAGMENT_MAX_WORDS } from "@crow-central-agency/shared";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { signalActiveDomain } from "./active-domain-signal.js";
import { toFragmentParent } from "./write-fragment.js";

export const UPDATE_FRAGMENT_TOOL_NAME = "update_fragment";

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

      const changes: string[] = [];
      // Re-link first: it validates against the same version and does not bump it,
      // so a combined relink + content update stays a single consistent operation
      if (parent !== undefined) {
        await fragmentManager.relinkFragment(agentId, id, toFragmentParent(agentId, parent), version);
        changes.push("re-linked");
      }

      if (cue !== undefined || body !== undefined) {
        await fragmentManager.updateFragmentForAgent(agentId, id, {
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
