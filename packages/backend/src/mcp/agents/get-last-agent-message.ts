import { z } from "zod";
import { AGENT_MESSAGE_ROLE, type AgentConfig } from "@crow-central-agency/shared";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { SessionManager } from "../../services/session/session-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { isCrowSystemAgent } from "../../utils/id-utils.js";

export const GET_LAST_AGENT_MESSAGE_TOOL_NAME = "get_last_agent_message";

export function getLastAgentMessageToolConfig(
  agentId: string,
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager,
  sessionManager: SessionManager
) {
  const inputSchema = {
    agent_id: z
      .string()
      .describe("The ID of the agent whose last message you want to retrieve. Use list_agents to find IDs."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ agent_id }) => {
    // Only the Crow system agent may use super-agent tools
    if (!isCrowSystemAgent(agentId)) {
      return textToolResult(["Error: this tool is only available to the system agent"], true);
    }

    let targetAgent: AgentConfig;
    try {
      targetAgent = registry.getAgent(agent_id);
    } catch {
      return textToolResult(["Error: agent not found"], true);
    }

    const state = runtimeManager.getState(agent_id);
    if (!state?.sessionId) {
      return textToolResult([`Agent "${targetAgent.name}" has no active session.`]);
    }

    try {
      const workspace = registry.resolveWorkspace(targetAgent);
      const messages = await sessionManager.loadMessages(state.sessionId, workspace);
      let lastAssistantMessage;
      for (let index = messages.length - 1; index >= 0; index--) {
        if (messages[index].role === AGENT_MESSAGE_ROLE.AGENT) {
          lastAssistantMessage = messages[index];
          break;
        }
      }

      if (!lastAssistantMessage) {
        return textToolResult([`Agent "${targetAgent.name}" has no assistant messages in the current session.`]);
      }

      return textToolResult([`Last message from "${targetAgent.name}":`, "", lastAssistantMessage.content]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to load messages.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_LAST_AGENT_MESSAGE_TOOL_NAME,
    description:
      "Get the most recent assistant message from a specific agent's current session. Useful for checking what an agent last said or produced.",
    inputSchema,
    handler,
  };

  return config;
}
