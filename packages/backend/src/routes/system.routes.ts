import type { FastifyInstance } from "fastify";
import { CLAUDE_CODE_MODEL_OPTIONS, type SystemCapabilities } from "@crow-central-agency/shared";
import { container } from "../container.js";
import type { CopilotClientManager } from "../services/copilot/copilot-client-manager.js";

function isAudioGenerationAvailable(): boolean {
  try {
    void container.audioGenProvider;
    return true;
  } catch {
    return false;
  }
}

function isTextGenerationAvailable(): boolean {
  // Generation runs on the internal Narrative Architect (Claude Code runtime), not an env-gated provider.
  return true;
}

/**
 * Register system capability/feature-flag routes.
 * Surfaces backend configuration state the UI needs to enable/disable
 * features whose backing services are env-gated.
 */
export async function registerSystemRoutes(server: FastifyInstance, copilotClientManager: CopilotClientManager) {
  server.get("/api/system/capabilities", async () => {
    const copilotSupportedModels = await copilotClientManager.listModelOptions();
    const capabilities: SystemCapabilities = {
      audioGeneration: isAudioGenerationAvailable(),
      textGeneration: isTextGenerationAvailable(),
      copilotAvailable: copilotClientManager.isAvailable(),
      claudeSupportedModels: [...CLAUDE_CODE_MODEL_OPTIONS],
      copilotSupportedModels,
    };

    return { success: true, data: capabilities };
  });
}
