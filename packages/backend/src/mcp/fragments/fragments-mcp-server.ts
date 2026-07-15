import {
  CROW_TASK_DISPATCHER_AGENT_ID,
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
  FRAGMENT_REFLECTION_AGENT_ID,
} from "@crow-central-agency/shared";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getWriteFragmentToolConfig } from "./write-fragment.js";
import { getReadFragmentToolConfig } from "./read-fragment.js";
import { getUpdateFragmentToolConfig } from "./update-fragment.js";
import { getLinkFragmentToolConfig } from "./link-fragment.js";
import { getUnlinkFragmentToolConfig } from "./unlink-fragment.js";

export const FRAGMENTS_MCP_SERVER_NAME = "crow-fragments";

export function getFragmentsMcpServerDefinition(
  fragmentManager: FragmentManager,
  runtimeManager: AgentRuntimeManager
): McpServerDefinition {
  return {
    name: FRAGMENTS_MCP_SERVER_NAME,
    disallowedAgentIds: [
      CROW_TASK_DISPATCHER_AGENT_ID,
      CROW_NARRATIVE_ARCHITECT_AGENT_ID,
      CROW_WORLD_BUILDER_AGENT_ID,
      // The reflection agent plans, never mutates — it gets only the read-only reflection server
      FRAGMENT_REFLECTION_AGENT_ID,
    ],
    getTools: (agentId) => [
      defineMcpTool(getWriteFragmentToolConfig(agentId, fragmentManager, runtimeManager)),
      defineMcpTool(getReadFragmentToolConfig(agentId, fragmentManager, runtimeManager)),
      defineMcpTool(getUpdateFragmentToolConfig(agentId, fragmentManager, runtimeManager)),
      defineMcpTool(getLinkFragmentToolConfig(agentId, fragmentManager, runtimeManager)),
      defineMcpTool(getUnlinkFragmentToolConfig(agentId, fragmentManager, runtimeManager)),
    ],
  };
}
