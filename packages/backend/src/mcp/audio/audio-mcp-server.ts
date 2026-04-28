import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import { getGenerateAudioToolConfig } from "./generate-audio.js";

export const CROW_AUDIO_MCP_SERVER_NAME = "crow-audio";

export function createAudioMcpServer(
  agentId: string,
  registry: AgentRegistry,
  artifactManager: ArtifactManager
): McpSdkServerConfigWithInstance {
  const generateAudio = getGenerateAudioToolConfig(agentId, registry, artifactManager);

  return createSdkMcpServer({
    name: CROW_AUDIO_MCP_SERVER_NAME,
    tools: [
      tool(generateAudio.name, generateAudio.description, generateAudio.inputSchema, generateAudio.handler, {
        annotations: generateAudio.annotations,
      }),
    ],
  });
}
