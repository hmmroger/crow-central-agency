import {
  CROW_TASK_DISPATCHER_AGENT_ID,
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
} from "@crow-central-agency/shared";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getWriteFragmentToolConfig } from "./write-fragment.js";
import { getReadFragmentToolConfig } from "./read-fragment.js";
import { getUpdateFragmentToolConfig } from "./update-fragment.js";
import { getDeleteFragmentToolConfig } from "./delete-fragment.js";

export const FRAGMENTS_MCP_SERVER_NAME = "crow-fragments";

export function getFragmentsMcpServerDefinition(fragmentManager: FragmentManager): McpServerDefinition {
  return {
    name: FRAGMENTS_MCP_SERVER_NAME,
    disallowedAgentIds: [CROW_TASK_DISPATCHER_AGENT_ID, CROW_NARRATIVE_ARCHITECT_AGENT_ID, CROW_WORLD_BUILDER_AGENT_ID],
    getTools: (agentId) => [
      defineMcpTool(getWriteFragmentToolConfig(agentId, fragmentManager)),
      defineMcpTool(getReadFragmentToolConfig(agentId, fragmentManager)),
      defineMcpTool(getUpdateFragmentToolConfig(agentId, fragmentManager)),
      defineMcpTool(getDeleteFragmentToolConfig(agentId, fragmentManager)),
    ],
  };
}
