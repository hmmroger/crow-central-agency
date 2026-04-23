import { z } from "zod";
import { AGENT_TASK_SOURCE_TYPE } from "@crow-central-agency/shared";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const DELETE_ARTIFACT_TOOL_NAME = "delete_artifact";

export function getDeleteArtifactToolConfig(agentId: string, artifactManager: ArtifactManager) {
  const inputSchema = {
    filename: z.string().describe("The exact filename to delete, as returned by list_artifacts."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ filename }) => {
    try {
      const metadata = await artifactManager.getArtifactMetadata(agentId, filename);
      const { createdBy } = metadata;
      const isOwnArtifact = createdBy.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT && createdBy.agentId === agentId;
      if (!isOwnArtifact) {
        return textToolResult(
          [
            `Error: cannot delete ${filename} - artifact is not attributed to you (created by: ${createdBy.sourceType})`,
          ],
          true
        );
      }

      await artifactManager.deleteArtifact(agentId, filename);
      return textToolResult([`Artifact deleted: ${filename}`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to delete artifact.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: DELETE_ARTIFACT_TOOL_NAME,
    description:
      "Delete an artifact file from your own artifacts folder. You can only delete artifacts that you created yourself.",
    inputSchema,
    handler,
  };

  return config;
}
