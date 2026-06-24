import {
  CROW_TASK_DISPATCHER_AGENT_ID,
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
} from "@crow-central-agency/shared";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getWriteArtifactToolConfig } from "./write-artifact.js";
import { getEditArtifactToolConfig } from "./edit-artifact.js";
import { getReadArtifactToolConfig } from "./read-artifact.js";
import { getListArtifactsToolConfig } from "./list-artifacts.js";
import { getDeleteArtifactToolConfig } from "./delete-artifact.js";
import { getFindContentInArtifactToolConfig } from "./find-content-in-artifact.js";
import { getWriteCircleArtifactToolConfig } from "./write-circle-artifact.js";
import { getEditCircleArtifactToolConfig } from "./edit-circle-artifact.js";
import { getReadCircleArtifactToolConfig } from "./read-circle-artifact.js";
import { getListCircleArtifactsToolConfig } from "./list-circle-artifacts.js";
import { getDeleteCircleArtifactToolConfig } from "./delete-circle-artifact.js";
import { getFindContentInCircleArtifactToolConfig } from "./find-content-in-circle-artifact.js";
import { getMoveArtifactToolConfig } from "./move-artifact.js";

export const ARTIFACTS_MCP_SERVER_NAME = "crow-artifacts";

export function getArtifactsMcpServerDefinition(
  artifactManager: ArtifactManager,
  registry: AgentRegistry,
  circleManager: AgentCircleManager,
  sensorManager: SensorManager
): McpServerDefinition {
  return {
    name: ARTIFACTS_MCP_SERVER_NAME,
    disallowedAgentIds: [CROW_TASK_DISPATCHER_AGENT_ID, CROW_NARRATIVE_ARCHITECT_AGENT_ID, CROW_WORLD_BUILDER_AGENT_ID],
    getTools: (agentId) => [
      defineMcpTool(getWriteArtifactToolConfig(agentId, artifactManager, sensorManager)),
      defineMcpTool(getEditArtifactToolConfig(agentId, artifactManager, sensorManager)),
      defineMcpTool(getReadArtifactToolConfig(agentId, artifactManager, registry, circleManager, sensorManager)),
      defineMcpTool(getListArtifactsToolConfig(agentId, artifactManager, registry, circleManager, sensorManager)),
      defineMcpTool(getDeleteArtifactToolConfig(agentId, artifactManager)),
      defineMcpTool(getFindContentInArtifactToolConfig(agentId, artifactManager)),
      defineMcpTool(getWriteCircleArtifactToolConfig(agentId, artifactManager, sensorManager)),
      defineMcpTool(getEditCircleArtifactToolConfig(agentId, artifactManager, sensorManager)),
      defineMcpTool(getReadCircleArtifactToolConfig(agentId, artifactManager, sensorManager)),
      defineMcpTool(getListCircleArtifactsToolConfig(agentId, artifactManager, sensorManager)),
      defineMcpTool(getDeleteCircleArtifactToolConfig(agentId, artifactManager)),
      defineMcpTool(getFindContentInCircleArtifactToolConfig(agentId, artifactManager)),
      defineMcpTool(getMoveArtifactToolConfig(agentId, artifactManager)),
    ],
  };
}
