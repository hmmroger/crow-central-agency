import { FRAGMENT_REFLECTION_AGENT_ID } from "@crow-central-agency/shared";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { DocumentSearchService } from "../../services/search/document-search-service.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getReadFragmentToolConfig } from "./read-fragment.js";
import { getSearchFragmentToolConfig } from "./search-fragment.js";

export const FRAGMENTS_REFLECTION_MCP_SERVER_NAME = "crow-fragments-reflection";

/**
 * Read-only fragment server for the reflection agent: `read_fragment` reused verbatim (its
 * accessibility check already admits the reflection agent) plus the target-scoped
 * `search_fragment`. No write tools — reflection returns a plan; it never mutates the vault.
 */
export function getFragmentsReflectionMcpServerDefinition(
  fragmentManager: FragmentManager,
  runtimeManager: AgentRuntimeManager,
  documentSearchService: DocumentSearchService
): McpServerDefinition {
  return {
    name: FRAGMENTS_REFLECTION_MCP_SERVER_NAME,
    allowedAgentIds: [FRAGMENT_REFLECTION_AGENT_ID],
    getTools: (agentId) => [
      defineMcpTool(getReadFragmentToolConfig(agentId, fragmentManager, runtimeManager)),
      defineMcpTool(getSearchFragmentToolConfig(fragmentManager, documentSearchService)),
    ],
  };
}
