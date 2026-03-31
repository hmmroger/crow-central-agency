import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { AgentTaskManager } from "../services/agent-task-manager.js";
import { AGENT_TASK_SOURCE_TYPE, type AgentConfig } from "@crow-central-agency/shared";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { MessageRoles } from "../model-providers/openai-provider.types.js";
import { ARTIFACTS_MCP_WRITE_ARTIFACT_TOOL_NAME } from "./artifacts-mcp-server.js";

export const AGENTS_MCP_LIST_AGENTS_TOOL_NAME = "list_agents";
export const AGENTS_MCP_INVOKE_AGENT_TOOL_NAME = "invoke_agent";

const INTER_AGENT_INVOKE_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Agent request from "{agentName}" ({agentId})]`,
        "",
        "{task}",
        "",
        `Please perform this task and write your results to an artifact using the "${ARTIFACTS_MCP_WRITE_ARTIFACT_TOOL_NAME}" tool.`,
      ],
    },
  ],
  keys: ["agentName", "agentId", "task"],
};

/**
 * Create the crow-agents MCP server for a specific agent.
 * Provides tools for discovering and invoking other agents.
 * MCP tool delegates to orchestrator - no business logic here.
 */
export function createAgentsMcpServer(
  agentId: string,
  registry: AgentRegistry,
  taskManager: AgentTaskManager
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "crow-agents",
    tools: [
      tool(
        AGENTS_MCP_LIST_AGENTS_TOOL_NAME,
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
        AGENTS_MCP_INVOKE_AGENT_TOOL_NAME,
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

          const sourceAgentConfig = registry.getAgent(agentId);
          let targetAgentConfig: AgentConfig;
          try {
            targetAgentConfig = registry.getAgent(args.agent_id);
          } catch {
            return { content: [{ type: "text", text: "Error: target agent not found" }], isError: true };
          }

          try {
            const result = await createTask(taskManager, sourceAgentConfig, targetAgentConfig, args.task);
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

async function createTask(
  taskManager: AgentTaskManager,
  sourceAgentConfig: AgentConfig,
  targetAgentConfig: AgentConfig,
  task: string
): Promise<string> {
  const sourceName = sourceAgentConfig.name;
  const taskPrompt = createMessageContentFromTemplate(
    INTER_AGENT_INVOKE_PROMPT,
    getDefaultPromptContext({
      agentId: sourceAgentConfig.id,
      agentName: sourceName,
      task,
    })
  );

  const sourceAgent = { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId: sourceAgentConfig.id };
  const newTask = await taskManager.addTask(taskPrompt, sourceAgent);
  await taskManager.assignTask(
    newTask.id,
    { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId: targetAgentConfig.id },
    sourceAgent
  );

  return `Task sent to agent "${targetAgentConfig.name}" (${targetAgentConfig.id}). The agent is working on it and you will be notified when the result is ready.`;
}
