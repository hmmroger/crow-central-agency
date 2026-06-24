import {
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_TASK_DISPATCHER_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
} from "@crow-central-agency/shared";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getGenerateAudioToolConfig } from "./generate-audio.js";

export const CROW_AUDIO_MCP_SERVER_NAME = "crow-audio";

export function getAudioMcpServerDefinition(
  registry: AgentRegistry,
  artifactManager: ArtifactManager
): McpServerDefinition {
  return {
    name: CROW_AUDIO_MCP_SERVER_NAME,
    disallowedAgentIds: [CROW_TASK_DISPATCHER_AGENT_ID, CROW_NARRATIVE_ARCHITECT_AGENT_ID, CROW_WORLD_BUILDER_AGENT_ID],
    getTools: (agentId) => [defineMcpTool(getGenerateAudioToolConfig(agentId, registry, artifactManager))],
  };
}
