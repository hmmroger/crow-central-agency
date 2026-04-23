import { z } from "zod";
import { AGENT_TASK_SOURCE_TYPE } from "@crow-central-agency/shared";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const DELETE_CIRCLE_ARTIFACT_TOOL_NAME = "delete_circle_artifact";

export function getDeleteCircleArtifactToolConfig(agentId: string, artifactManager: ArtifactManager) {
  const inputSchema = {
    circle_id: z.string().describe("The circle ID that owns the artifact"),
    filename: z.string().describe("The exact filename to delete, as returned by list_circle_artifacts"),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ circle_id, filename }) => {
    if (!artifactManager.isDirectCircleMember(circle_id, agentId)) {
      return textToolResult(["Error: you are not a direct member of this circle"], true);
    }

    try {
      const metadata = await artifactManager.getCircleArtifactMetadata(circle_id, filename);
      const { createdBy } = metadata;
      if (createdBy.sourceType !== AGENT_TASK_SOURCE_TYPE.AGENT) {
        return textToolResult(
          [
            `Error: cannot delete ${filename} - circle artifact is not agent-authored (created by: ${createdBy.sourceType})`,
          ],
          true
        );
      }

      await artifactManager.deleteCircleArtifact(circle_id, filename);
      return textToolResult([`Circle artifact deleted: ${filename} (circle: ${circle_id})`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to delete circle artifact.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: DELETE_CIRCLE_ARTIFACT_TOOL_NAME,
    description:
      "Delete an artifact file from a circle's shared folder. Only direct members of the circle can use this tool. Any agent-authored artifact in the circle can be deleted.",
    inputSchema,
    handler,
  };

  return config;
}
