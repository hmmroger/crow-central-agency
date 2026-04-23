import { z } from "zod";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { buildReadArtifactResult } from "./artifacts-mcp-server-utils.js";

export const READ_CIRCLE_ARTIFACT_TOOL_NAME = "read_circle_artifact";

export function getReadCircleArtifactToolConfig(
  agentId: string,
  artifactManager: ArtifactManager,
  sensorManager: SensorManager
) {
  const inputSchema = {
    circle_id: z.string().describe("The circle ID that owns the artifact"),
    filename: z.string().describe("The exact filename to read, as returned by list_circle_artifacts"),
    showLineNumber: z.boolean().optional().describe("Optional. Add line marker in the result."),
    startLine: z
      .number()
      .min(1)
      .optional()
      .describe("Optional. Starting line number (1-based) to begin reading from (default: 1)."),
    limit: z
      .number()
      .min(1)
      .optional()
      .describe("Optional. Maximum number of lines to return starting from startLine."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({
    circle_id,
    filename,
    showLineNumber,
    startLine,
    limit,
  }) => {
    if (!artifactManager.isDirectCircleMember(circle_id, agentId)) {
      return textToolResult(["Error: you are not a direct member of this circle"], true);
    }

    try {
      const [content, metadata, userTimezone] = await Promise.all([
        artifactManager.readCircleArtifact(circle_id, filename, { useAdapter: true }),
        artifactManager.getCircleArtifactMetadata(circle_id, filename),
        sensorManager.getUserTimezone(),
      ]);

      return buildReadArtifactResult(content, metadata, userTimezone, { showLineNumber, startLine, limit });
    } catch (error) {
      return getErrorToolResult(error, "Failed to read circle artifact.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: READ_CIRCLE_ARTIFACT_TOOL_NAME,
    description:
      "Read the contents of an artifact file from a circle's shared folder. Only direct members of the circle can access circle artifacts.",
    inputSchema,
    handler,
  };

  return config;
}
