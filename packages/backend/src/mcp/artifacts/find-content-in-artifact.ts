import { z } from "zod";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { buildFindContentResult } from "./artifacts-mcp-server-utils.js";

export const FIND_CONTENT_IN_ARTIFACT_TOOL_NAME = "find_content_in_artifact";

export function getFindContentInArtifactToolConfig(agentId: string, artifactManager: ArtifactManager) {
  const inputSchema = {
    filename: z.string().describe("Name of an existing TEXT artifact to search."),
    query: z.string().min(1).describe("Substring to search for. Case-insensitive."),
    startLine: z
      .number()
      .min(1)
      .optional()
      .describe("Optional. 1-based line number to start searching from. Defaults to 1."),
    limit: z.number().min(1).optional().describe("Optional. Maximum number of matches to return."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ filename: rawFilename, query, startLine, limit }) => {
    const filename = rawFilename.trim();
    try {
      if (!query) {
        return textToolResult(["Search query must not be empty."], true);
      }

      const result = await artifactManager.findArtifactContent(agentId, filename, query, startLine);
      return buildFindContentResult(filename, query, result, limit);
    } catch (error) {
      return getErrorToolResult(error, "Failed to search artifact content.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: FIND_CONTENT_IN_ARTIFACT_TOOL_NAME,
    description:
      "Search a TEXT artifact you own for a substring and return matching lines with their 1-based line numbers. Case-insensitive. Use startLine to skip ahead and limit to cap the number of matches.",
    inputSchema,
    handler,
  };

  return config;
}
