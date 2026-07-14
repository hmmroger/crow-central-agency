import { z } from "zod";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { signalActiveDomain } from "./active-domain-signal.js";

export const READ_FRAGMENT_TOOL_NAME = "read_fragment";

export function getReadFragmentToolConfig(
  agentId: string,
  fragmentManager: FragmentManager,
  runtimeManager: AgentRuntimeManager
) {
  const inputSchema = {
    id: z.string().min(1).describe("Fragment id to read."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ id }) => {
    try {
      const fragment = await fragmentManager.readFragmentForAgent(agentId, id);
      await fragmentManager.recordRecall(id);
      const childCues = await fragmentManager.getChildFragmentCues(id);
      await signalActiveDomain(agentId, id, fragmentManager, runtimeManager);

      const lines = [
        `[${fragment.kind}] ${fragment.cue}`,
        `[Id: ${fragment.id} | Version: ${fragment.updatedTimestamp}]`,
        "--- BODY ---",
        fragment.body,
      ];
      if (childCues.length > 0) {
        lines.push("--- CHILD FRAGMENTS ---");
        for (const childCue of childCues) {
          lines.push(`- [${childCue.id}] (${childCue.kind}) ${childCue.cue}`);
        }
      }

      return textToolResult(lines);
    } catch (error) {
      return getErrorToolResult(error, "Failed to read fragment.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: READ_FRAGMENT_TOOL_NAME,
    description:
      "Read a fragment's full body plus the cues of the fragments nested under it. Use the ids from your fragment cues to navigate down.",
    inputSchema,
    handler,
  };

  return config;
}
