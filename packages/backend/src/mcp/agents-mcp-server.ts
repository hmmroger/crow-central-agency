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
      tool(
        "list_agents",
        "List all registered agents with their IDs, names, and role descriptions. Use this to discover which agents are available for collaboration.",
        {},
        async () => {
          const agents = registry.getAllAgents().filter((agent) => agent.id !== agentId);
          if (agents.length === 0) {
            return { content: [{ type: "text", text: "No agents are currently registered." }] };
          }

          const lines = agents.map((agent) => {
            const parts = [`${agent.name} (ID: ${agent.id})`];
            if (agent.description) {
              parts.push(`- ${agent.description}`);
            }

            return `- ${parts.join(" ")}`;
          });
          return {
            content: [{ type: "text", text: `Available agents:\n${lines.join("\n")}` }],
          };
        }
      ),

      tool(
        "invoke_agent",
        "Delegate a task to another agent. The target agent will work on it asynchronously and write results to its artifacts. You will be notified automatically when the agent finishes.",
        {
          agent_id: z
            .string()
            .describe("The ID of the target agent to delegate the task to. Use list_agents to find IDs"),
          task: z
            .string()
            .describe(
              "A clear, self-contained description of what the target agent should do. Include all necessary context since the target agent does not share your conversation history"
            ),
        },
        async (args) => {
          if (agentId === args.agent_id) {
            return { content: [{ type: "text", text: "Error: cannot invoke yourself" }], isError: true };
          }

          try {
            registry.getAgent(args.agent_id);
          } catch {
            return { content: [{ type: "text", text: "Error: target agent not found" }], isError: true };
          }

          try {
            const result = await orchestrator.invokeInterAgent(agentId, args.agent_id, args.task);
            return { content: [{ type: "text", text: result }] };
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to invoke agent";
            return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
          }
        }
      ),
    ],
  });
}
