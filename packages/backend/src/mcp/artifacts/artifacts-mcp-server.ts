import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
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

export const ARTIFACTS_MCP_SERVER_NAME = "crow-artifacts";

export function createArtifactsMcpServer(
  agentId: string,
  artifactManager: ArtifactManager,
  registry: AgentRegistry,
  circleManager: AgentCircleManager,
  sensorManager: SensorManager
): McpSdkServerConfigWithInstance {
  const writeArtifact = getWriteArtifactToolConfig(agentId, artifactManager, sensorManager);
  const editArtifact = getEditArtifactToolConfig(agentId, artifactManager, sensorManager);
  const readArtifact = getReadArtifactToolConfig(agentId, artifactManager, registry, circleManager, sensorManager);
  const listArtifacts = getListArtifactsToolConfig(agentId, artifactManager, registry, circleManager, sensorManager);
  const deleteArtifact = getDeleteArtifactToolConfig(agentId, artifactManager);
  const findContentInArtifact = getFindContentInArtifactToolConfig(agentId, artifactManager);
  const writeCircleArtifact = getWriteCircleArtifactToolConfig(agentId, artifactManager, sensorManager);
  const editCircleArtifact = getEditCircleArtifactToolConfig(agentId, artifactManager, sensorManager);
  const readCircleArtifact = getReadCircleArtifactToolConfig(agentId, artifactManager, sensorManager);
  const listCircleArtifacts = getListCircleArtifactsToolConfig(agentId, artifactManager, sensorManager);
  const deleteCircleArtifact = getDeleteCircleArtifactToolConfig(agentId, artifactManager);
  const findContentInCircleArtifact = getFindContentInCircleArtifactToolConfig(agentId, artifactManager);

  return createSdkMcpServer({
    name: ARTIFACTS_MCP_SERVER_NAME,
    tools: [
      tool(writeArtifact.name, writeArtifact.description, writeArtifact.inputSchema, writeArtifact.handler, {
        annotations: writeArtifact.annotations,
      }),
      tool(editArtifact.name, editArtifact.description, editArtifact.inputSchema, editArtifact.handler, {
        annotations: editArtifact.annotations,
      }),
      tool(readArtifact.name, readArtifact.description, readArtifact.inputSchema, readArtifact.handler, {
        annotations: readArtifact.annotations,
      }),
      tool(listArtifacts.name, listArtifacts.description, listArtifacts.inputSchema, listArtifacts.handler, {
        annotations: listArtifacts.annotations,
      }),
      tool(deleteArtifact.name, deleteArtifact.description, deleteArtifact.inputSchema, deleteArtifact.handler, {
        annotations: deleteArtifact.annotations,
      }),
      tool(
        findContentInArtifact.name,
        findContentInArtifact.description,
        findContentInArtifact.inputSchema,
        findContentInArtifact.handler,
        { annotations: findContentInArtifact.annotations }
      ),
      tool(
        writeCircleArtifact.name,
        writeCircleArtifact.description,
        writeCircleArtifact.inputSchema,
        writeCircleArtifact.handler,
        { annotations: writeCircleArtifact.annotations }
      ),
      tool(
        editCircleArtifact.name,
        editCircleArtifact.description,
        editCircleArtifact.inputSchema,
        editCircleArtifact.handler,
        { annotations: editCircleArtifact.annotations }
      ),
      tool(
        readCircleArtifact.name,
        readCircleArtifact.description,
        readCircleArtifact.inputSchema,
        readCircleArtifact.handler,
        { annotations: readCircleArtifact.annotations }
      ),
      tool(
        listCircleArtifacts.name,
        listCircleArtifacts.description,
        listCircleArtifacts.inputSchema,
        listCircleArtifacts.handler,
        { annotations: listCircleArtifacts.annotations }
      ),
      tool(
        deleteCircleArtifact.name,
        deleteCircleArtifact.description,
        deleteCircleArtifact.inputSchema,
        deleteCircleArtifact.handler,
        { annotations: deleteCircleArtifact.annotations }
      ),
      tool(
        findContentInCircleArtifact.name,
        findContentInCircleArtifact.description,
        findContentInCircleArtifact.inputSchema,
        findContentInCircleArtifact.handler,
        { annotations: findContentInCircleArtifact.annotations }
      ),
    ],
  });
}
