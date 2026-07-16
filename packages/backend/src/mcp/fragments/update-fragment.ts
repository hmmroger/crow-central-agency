import { z } from "zod";
import { FRAGMENT_MAX_WORDS } from "@crow-central-agency/shared";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { signalActiveDomain } from "./active-domain-signal.js";
import { assertFragmentAccessible } from "./fragment-tool-utils.js";

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
    version: z
      .number()
      .optional()
      .describe(
        "The Version value from your most recent read of this fragment; the update is rejected if it changed since."
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ id, cue, body, version }) => {
    try {
      if (cue === undefined && body === undefined) {
        throw new Error("Provide at least one of cue or body.");
      }

      assertFragmentAccessible(fragmentManager, agentId, id);

      await fragmentManager.updateFragment(id, {
        cue,
        body,
        expectedUpdatedTimestamp: version,
      });

      const changes: string[] = [];
      if (cue !== undefined) {
        changes.push("cue");
      }

      if (body !== undefined) {
        changes.push("body");
      }

      await signalActiveDomain(agentId, id, fragmentManager, runtimeManager);

      return textToolResult([
        `Fragment updated: ${id} (${changes.join(", ")}). Re-read the fragment before the next update; Version is now stale.`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to update fragment.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: UPDATE_FRAGMENT_TOOL_NAME,
    description:
      "Modify a fragment's cue and/or body — content only; use link_fragment/unlink_fragment for structural moves. Pass the Version from your last read to guard against concurrent changes to shared fragments.",
    inputSchema,
    handler,
  };

  return config;
}
