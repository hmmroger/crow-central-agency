import { AGENT_TYPE } from "@crow-central-agency/shared";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { CrowMcpManager } from "../mcp/crow-mcp-manager.js";
import type { SensorManager } from "../sensors/sensor-manager.js";
import type { AgentCircleManager } from "../services/agent-circle-manager.js";
import type { FragmentManager } from "../services/fragment/fragment-manager.js";
import type { AgentRuntimeManager } from "../services/runtime/agent-runtime-manager.js";
import type { AgentRunner } from "./agent-runner.js";
import { ClaudeCodeAgentRunner } from "./claude-code-agent-runner.js";
import { GithubCopilotAgentRunner } from "./github-copilot-agent-runner.js";
import type { OOBStreamEventCallback, PermissionRequestCallback } from "./agent-runner.types.js";

export function createAgentRunner(
  agentId: string,
  registry: AgentRegistry,
  mcpManager: CrowMcpManager,
  sensorManager: SensorManager,
  circleManager: AgentCircleManager,
  fragmentManager: FragmentManager,
  runtimeManager: AgentRuntimeManager,
  permissionRequestHandler: PermissionRequestCallback,
  oobEventCallback: OOBStreamEventCallback
): AgentRunner {
  const agent = registry.getAgent(agentId);
  switch (agent.type) {
    case AGENT_TYPE.CLAUDE_CODE:
      return new ClaudeCodeAgentRunner(
        agentId,
        registry,
        mcpManager,
        sensorManager,
        circleManager,
        fragmentManager,
        runtimeManager,
        permissionRequestHandler,
        oobEventCallback
      );

    case AGENT_TYPE.GITHUB_COPILOT:
      return new GithubCopilotAgentRunner(
        agentId,
        registry,
        mcpManager,
        sensorManager,
        circleManager,
        fragmentManager,
        runtimeManager,
        permissionRequestHandler,
        oobEventCallback
      );
  }
}
