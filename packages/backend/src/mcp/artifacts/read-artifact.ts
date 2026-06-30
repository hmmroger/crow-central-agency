import { z } from "zod";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { buildReadArtifactResult, DEFAULT_READ_ARTIFACT_LINE_LIMIT } from "./artifacts-mcp-server-utils.js";

export const READ_ARTIFACT_TOOL_NAME = "read_artifact";

export function getReadArtifactToolConfig(
  agentId: string,
  artifactManager: ArtifactManager,
  registry: AgentRegistry,
  circleManager: AgentCircleManager,
  sensorManager: SensorManager
) {
  const inputSchema = {
    agent_id: z.string().describe("The agent ID who owns the artifact. Use list_agents to find agent IDs."),
    filename: z.string().describe("The exact filename to read, as returned by list_artifacts."),
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
      .describe(
        `Optional. Maximum number of lines to return starting from startLine (default: ${DEFAULT_READ_ARTIFACT_LINE_LIMIT}).`
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ agent_id, filename, showLineNumber, startLine, limit }) => {
    try {
      registry.getAgent(agent_id);
    } catch {
      return textToolResult(["Target agent not found."], true);
    }

    if (!circleManager.isAgentVisible(agentId, agent_id)) {
      return textToolResult(["Target agent is not visible to you."], true);
    }

    try {
      const [{ content, metadata }, userTimezone] = await Promise.all([
        artifactManager.readArtifact(agent_id, filename, { useAdapter: true }),
        sensorManager.getUserTimezone(),
      ]);

      return buildReadArtifactResult(content, metadata, userTimezone, {
        showLineNumber,
        startLine,
        limit: limit ?? DEFAULT_READ_ARTIFACT_LINE_LIMIT,
      });
    } catch (error) {
      return getErrorToolResult(error, "Failed to read artifact.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: READ_ARTIFACT_TOOL_NAME,
    description:
      "Read the contents of an artifact file from any agent's folder. Use list_agents to find agent IDs, then list_artifacts to discover filenames.",
    inputSchema,
    handler,
  };

  return config;
}
