import { z } from "zod";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { applyPagination, formatPaginationHeader, getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatLocalDateTime } from "../../utils/date-utils.js";
import { ARTIFACT_TYPE_VALUES } from "./artifacts-mcp-server-utils.js";

const DEFAULT_ARTIFACTS_LIMIT = 50;

export const LIST_ARTIFACTS_TOOL_NAME = "list_artifacts";

export function getListArtifactsToolConfig(
  agentId: string,
  artifactManager: ArtifactManager,
  registry: AgentRegistry,
  circleManager: AgentCircleManager,
  sensorManager: SensorManager
) {
  const inputSchema = {
    agent_id: z.string().optional().describe("The agent ID whose artifacts to list. Omit to list your own artifacts"),
    type: z
      .enum(ARTIFACT_TYPE_VALUES)
      .optional()
      .describe(`Filter by artifact type. Values: ${ARTIFACT_TYPE_VALUES.join(", ")}`),
    limit: z.number().optional().describe("Number of artifacts to return per page."),
    skip: z.number().optional().describe("Number of artifacts to skip for pagination."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ agent_id, type, limit, skip }) => {
    const targetId = agent_id ?? agentId;
    if (agent_id) {
      try {
        registry.getAgent(agent_id);
      } catch {
        return textToolResult(["Error: agent not found"], true);
      }

      if (!circleManager.isAgentVisible(agentId, targetId)) {
        return textToolResult(["Error: agent not visible to you"], true);
      }
    }

    try {
      const [artifacts, userTimezone] = await Promise.all([
        artifactManager.listArtifacts(targetId, { type }),
        sensorManager.getUserTimezone(),
      ]);
      if (artifacts.length === 0) {
        const suffix = type ? ` with type ${type}` : "";
        return textToolResult([`No artifacts found for agent ${targetId}${suffix}.`]);
      }

      const pagination = applyPagination(artifacts, limit || DEFAULT_ARTIFACTS_LIMIT, skip);
      const lines = pagination.items.map(
        (artifact) =>
          `- ${artifact.filename} (owner: ${artifact.entityId}, type: ${artifact.type}, modified: ${formatLocalDateTime(new Date(artifact.updatedTimestamp), userTimezone)})`
      );
      const header = formatPaginationHeader(`Artifacts for agent ${targetId}`, pagination);
      return textToolResult(header.concat("", lines));
    } catch (error) {
      return getErrorToolResult(error, "Failed to list artifacts.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_ARTIFACTS_TOOL_NAME,
    description: `List artifact files for yourself or another agent, ordered by most recently modified first (default: ${DEFAULT_ARTIFACTS_LIMIT} items). Returns filenames, types, and last modified dates. Optionally filter by artifact type.`,
    inputSchema,
    handler,
  };

  return config;
}
