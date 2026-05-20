import { z } from "zod";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { buildFindContentResult } from "./artifacts-mcp-server-utils.js";

export const FIND_CONTENT_IN_CIRCLE_ARTIFACT_TOOL_NAME = "find_content_in_circle_artifact";

export function getFindContentInCircleArtifactToolConfig(agentId: string, artifactManager: ArtifactManager) {
  const inputSchema = {
    circle_id: z.string().describe("The circle ID that owns the artifact."),
    filename: z.string().describe("Name of an existing TEXT circle artifact to search."),
    query: z.string().min(1).describe("Substring to search for. Case-insensitive."),
    startLine: z
      .number()
      .min(1)
      .optional()
      .describe("Optional. 1-based line number to start searching from. Defaults to 1."),
    limit: z.number().min(1).optional().describe("Optional. Maximum number of matches to return."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({
    circle_id,
    filename: rawFilename,
    query,
    startLine,
    limit,
  }) => {
    if (!artifactManager.isDirectCircleMember(circle_id, agentId)) {
      return textToolResult(["You are not a direct member of this circle."], true);
    }

    const filename = rawFilename.trim();
    try {
      if (!query) {
        return textToolResult(["Search query must not be empty."], true);
      }

      const result = await artifactManager.findCircleArtifactContent(circle_id, filename, query, startLine);
      return buildFindContentResult(filename, query, result, limit);
    } catch (error) {
      return getErrorToolResult(error, "Failed to search circle artifact content.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: FIND_CONTENT_IN_CIRCLE_ARTIFACT_TOOL_NAME,
    description:
      "Search a TEXT circle artifact for a substring and return matching lines with their 1-based line numbers. Only direct members of the circle can search. Case-insensitive. Use startLine to skip ahead and limit to cap the number of matches.",
    inputSchema,
    handler,
  };

  return config;
}
