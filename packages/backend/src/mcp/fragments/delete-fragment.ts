import { z } from "zod";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const DELETE_FRAGMENT_TOOL_NAME = "delete_fragment";

export function getDeleteFragmentToolConfig(agentId: string, fragmentManager: FragmentManager) {
  const inputSchema = {
    id: z.string().min(1).describe("Fragment id to delete."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ id }) => {
    try {
      await fragmentManager.deleteFragmentForAgent(agentId, id);

      return textToolResult([`Fragment deleted: ${id}`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to delete fragment.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: DELETE_FRAGMENT_TOOL_NAME,
    description:
      "Permanently delete a fragment. Rejected while it has child fragments (move or delete them first) or while other agents can still reach it. Use update_fragment to re-parent instead of deleting.",
    inputSchema,
    handler,
  };

  return config;
}
