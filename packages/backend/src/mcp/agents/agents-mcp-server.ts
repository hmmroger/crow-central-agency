import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { DocumentSearchService } from "../../services/search/document-search-service.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getListAgentsToolConfig } from "./list-agents.js";
import { getInvokeAgentToolConfig } from "./invoke-agent.js";
import { getSearchWorkspaceToolConfig } from "./search-workspace.js";
import {
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
  FRAGMENT_REFLECTION_AGENT_ID,
} from "@crow-central-agency/shared";

export const CROW_AGENTS_MCP_SERVER_NAME = "crow-agents";

export function getAgentsMcpServerDefinition(
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager,
  taskManager: AgentTaskManager,
  documentSearchService: DocumentSearchService,
  circleManager: AgentCircleManager,
  fragmentManager: FragmentManager
): McpServerDefinition {
  return {
    name: CROW_AGENTS_MCP_SERVER_NAME,
    disallowedAgentIds: [CROW_NARRATIVE_ARCHITECT_AGENT_ID, CROW_WORLD_BUILDER_AGENT_ID, FRAGMENT_REFLECTION_AGENT_ID],
    getTools: (agentId) => [
      defineMcpTool(getListAgentsToolConfig(agentId, registry)),
      defineMcpTool(getInvokeAgentToolConfig(agentId, registry, runtimeManager, taskManager)),
      defineMcpTool(
        getSearchWorkspaceToolConfig(agentId, documentSearchService, taskManager, circleManager, fragmentManager)
      ),
    ],
  };
}
