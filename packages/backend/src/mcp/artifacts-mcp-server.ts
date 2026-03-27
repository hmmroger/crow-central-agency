import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { ArtifactManager } from "../services/artifact-manager.js";
import type { AgentRegistry } from "../services/agent-registry.js";

export const ARTIFACTS_MCP_WRITE_ARTIFACT_TOOL_NAME = "write_artifact";
export const ARTIFACTS_MCP_READ_ARTIFACT_TOOL_NAME = "read_artifact";
export const ARTIFACTS_MCP_LIST_ARTIFACTS_TOOL_NAME = "list_artifacts";

/**
 * Create the crow-artifacts MCP server for a specific agent.
 * Provides tools for writing, reading, and listing artifacts.
 */
export function createArtifactsMcpServer(
  agentId: string,
  artifactManager: ArtifactManager,
  registry: AgentRegistry
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "crow-artifacts",
    tools: [
      tool(
        ARTIFACTS_MCP_WRITE_ARTIFACT_TOOL_NAME,
        "Save a file to your own artifacts folder. Other agents can read your artifacts to collaborate. You can only write to your own folder.",
        {
          filename: z.string().describe("Name of the file to create or overwrite, e.g. 'report.md' or 'data.json'"),
          content: z.string().describe("The full text content to write to the file"),
        },
        async (args) => {
          await artifactManager.writeArtifact(agentId, args.filename, args.content);

          return { content: [{ type: "text", text: `Artifact written: ${args.filename}` }] };
        }
      ),

      tool(
        ARTIFACTS_MCP_READ_ARTIFACT_TOOL_NAME,
        "Read the contents of an artifact file from any agent's folder. Use list_agents to find agent IDs, then list_artifacts to discover filenames.",
        {
          agent_id: z.string().describe("The agent ID who owns the artifact. Use list_agents to find agent IDs"),
          filename: z.string().describe("The exact filename to read, as returned by list_artifacts"),
        },
        async (args) => {
          try {
            registry.getAgent(args.agent_id);
          } catch {
            return { content: [{ type: "text", text: "Error: agent not found" }], isError: true };
          }

          try {
            const content = await artifactManager.readArtifact(args.agent_id, args.filename);
            return { content: [{ type: "text", text: content }] };
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to read artifact";
            return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
          }
        }
      ),

      tool(
        ARTIFACTS_MCP_LIST_ARTIFACTS_TOOL_NAME,
        "List all artifact files for yourself or another agent. Returns filenames and last modified dates. Omit agent_id to list your own artifacts.",
        {
          agent_id: z
            .string()
            .optional()
            .describe("The agent ID whose artifacts to list. Omit to list your own artifacts"),
        },
        async (args) => {
          const targetId = args.agent_id ?? agentId;
          if (args.agent_id) {
            try {
              registry.getAgent(args.agent_id);
            } catch {
              return { content: [{ type: "text", text: "Error: agent not found" }], isError: true };
            }
          }

          const artifacts = await artifactManager.listArtifacts(targetId);
          if (artifacts.length === 0) {
            return { content: [{ type: "text", text: `No artifacts found for agent ${targetId}.` }] };
          }

          const lines = artifacts.map(
            (artifact) => `- ${artifact.filename} (agent: ${artifact.agentId}, modified: ${artifact.updatedAt})`
          );
          return {
            content: [{ type: "text", text: `Artifacts for agent ${targetId}:\n${lines.join("\n")}` }],
          };
        }
      ),
    ],
  });
}
