import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { ArtifactManager } from "../services/artifact-manager.js";

/**
 * Create the crow-artifacts MCP server for a specific agent.
 * Provides tools for writing, reading, and listing artifacts.
 */
export function createArtifactsMcpServer(
  agentId: string,
  artifactManager: ArtifactManager
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "crow-artifacts",
    tools: [
      tool(
        "write_artifact",
        "Write a file to your artifacts folder. Other agents can read your artifacts.",
        {
          filename: z.string().describe("Name of the artifact file"),
          content: z.string().describe("Content to write"),
        },
        async (args) => {
          await artifactManager.writeArtifact(agentId, args.filename, args.content);

          return { content: [{ type: "text", text: `Artifact written: ${args.filename}` }] };
        }
      ),

      tool(
        "read_artifact",
        "Read an artifact file from any agent's artifacts folder.",
        {
          agentId: z.string().describe("UUID of the agent whose artifact to read"),
          filename: z.string().describe("Name of the artifact file"),
        },
        async (args) => {
          const content = await artifactManager.readArtifact(args.agentId, args.filename);

          return { content: [{ type: "text", text: content }] };
        }
      ),

      tool("list_artifacts", "List all artifacts in your own artifacts folder.", {}, async () => {
        const artifacts = await artifactManager.listArtifacts(agentId);

        return {
          content: [
            {
              type: "text",
              text:
                artifacts.length === 0
                  ? "No artifacts found."
                  : artifacts.map((artifact) => `${artifact.filename} (${artifact.size} bytes)`).join("\n"),
            },
          ],
        };
      }),

      tool(
        "list_agent_artifacts",
        "List all artifacts in another agent's artifacts folder.",
        { agentId: z.string().describe("UUID of the agent whose artifacts to list") },
        async (args) => {
          const artifacts = await artifactManager.listArtifacts(args.agentId);

          return {
            content: [
              {
                type: "text",
                text:
                  artifacts.length === 0
                    ? "No artifacts found for this agent."
                    : artifacts.map((artifact) => `${artifact.filename} (${artifact.size} bytes)`).join("\n"),
              },
            ],
          };
        }
      ),
    ],
  });
}
