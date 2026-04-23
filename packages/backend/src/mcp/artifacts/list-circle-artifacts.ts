import { z } from "zod";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { applyPagination, formatPaginationHeader, getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatLocalDateTime } from "../../utils/date-utils.js";
import { ARTIFACT_TYPE_VALUES } from "./artifacts-mcp-server-utils.js";

const DEFAULT_CIRCLE_ARTIFACTS_LIMIT = 50;

export const LIST_CIRCLE_ARTIFACTS_TOOL_NAME = "list_circle_artifacts";

export function getListCircleArtifactsToolConfig(
  agentId: string,
  artifactManager: ArtifactManager,
  sensorManager: SensorManager
) {
  const inputSchema = {
    circle_id: z.string().describe("The circle ID whose artifacts to list"),
    type: z
      .enum(ARTIFACT_TYPE_VALUES)
      .optional()
      .describe(`Filter by artifact type. Values: ${ARTIFACT_TYPE_VALUES.join(", ")}`),
    limit: z.number().optional().describe("Number of artifacts to return per page."),
    skip: z.number().optional().describe("Number of artifacts to skip for pagination."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ circle_id, type, limit, skip }) => {
    if (!artifactManager.isDirectCircleMember(circle_id, agentId)) {
      return textToolResult(["Error: you are not a direct member of this circle"], true);
    }

    try {
      const [artifacts, userTimezone] = await Promise.all([
        artifactManager.listCircleArtifacts(circle_id, { type }),
        sensorManager.getUserTimezone(),
      ]);
      if (artifacts.length === 0) {
        const suffix = type ? ` with type ${type}` : "";
        return textToolResult([`No artifacts found for circle ${circle_id}${suffix}.`]);
      }

      const pagination = applyPagination(artifacts, limit || DEFAULT_CIRCLE_ARTIFACTS_LIMIT, skip);
      const lines = pagination.items.map(
        (artifact) =>
          `- ${artifact.filename} (type: ${artifact.type}, modified: ${formatLocalDateTime(new Date(artifact.updatedTimestamp), userTimezone)})`
      );
      const header = formatPaginationHeader(`Artifacts for circle ${circle_id}`, pagination);
      return textToolResult(header.concat("", lines));
    } catch (error) {
      return getErrorToolResult(error, "Failed to list circle artifacts.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_CIRCLE_ARTIFACTS_TOOL_NAME,
    description: `List artifact files in a circle's shared folder, ordered by most recently modified first (default: ${DEFAULT_CIRCLE_ARTIFACTS_LIMIT} items). Only direct members of the circle can access circle artifacts. Optionally filter by artifact type.`,
    inputSchema,
    handler,
  };

  return config;
}
