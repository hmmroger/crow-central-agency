import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { AgentOrchestrator } from "../services/agent-orchestrator.js";
import type { AgentRegistry } from "../services/agent-registry.js";

/**
 * Create the crow-agents MCP server for a specific agent.
 * Provides tools for discovering and invoking other agents.
 * MCP tool delegates to orchestrator — no business logic here.
 */
export function createAgentsMcpServer(
  agentId: string,
  orchestrator: AgentOrchestrator,
  registry: AgentRegistry
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "crow-agents",
    tools: [
      tool("list_agents", "List all available agents you can collaborate with.", {}, async () => {
        const agents = registry
          .getAll()
          .filter((agent) => agent.id !== agentId)
          .map((agent) => `- ${agent.name} (${agent.id}): ${agent.description || "No description"}`);

        return {
          content: [
            {
              type: "text",
              text: agents.length === 0 ? "No other agents available." : `Available agents:\n${agents.join("\n")}`,
            },
          ],
        };
      }),

      tool(
        "invoke_agent",
        "Send a task to another agent. The agent will work on it asynchronously and you will be notified when the result is ready.",
        {
          targetAgentId: z.string().describe("UUID of the agent to invoke"),
          task: z.string().describe("Description of the task for the agent to perform"),
        },
        async (args) => {
          try {
            await orchestrator.invokeInterAgent(agentId, args.targetAgentId, args.task);
            const targetAgent = registry.get(args.targetAgentId);

            return {
              content: [
                {
                  type: "text",
                  text: `Task sent to agent "${targetAgent?.name ?? args.targetAgentId}" (${args.targetAgentId}). The agent is working on it and you will be notified when the result is ready.`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [{ type: "text", text: error instanceof Error ? error.message : "Failed to invoke agent" }],
              isError: true,
            };
          }
        }
      ),

      tool(
        "get_agent_status",
        "Get the current status of another agent.",
        { targetAgentId: z.string().describe("UUID of the agent to check") },
        async (args) => {
          const agent = registry.get(args.targetAgentId);

          if (!agent) {
            return { content: [{ type: "text", text: `Agent not found: ${args.targetAgentId}` }], isError: true };
          }

          const state = orchestrator.getState(args.targetAgentId);

          return {
            content: [{ type: "text", text: `Agent "${agent.name}" (${agent.id}): status=${state?.status ?? "idle"}` }],
          };
        }
      ),
    ],
  });
}
