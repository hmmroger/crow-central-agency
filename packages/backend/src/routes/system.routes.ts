import type { FastifyInstance } from "fastify";
import type { SystemCapabilities } from "@crow-central-agency/shared";
import { container } from "../container.js";

function isAudioGenerationAvailable(): boolean {
  try {
    void container.audioGenProvider;
    return true;
  } catch {
    return false;
  }
}

function isTextGenerationAvailable(): boolean {
  try {
    void container.textGenProvider;
    return true;
  } catch {
    return false;
  }
}

/**
 * Register system capability/feature-flag routes.
 * Surfaces backend configuration state the UI needs to enable/disable
 * features whose backing services are env-gated.
 */
export async function registerSystemRoutes(server: FastifyInstance) {
  server.get("/api/system/capabilities", async () => {
    const capabilities: SystemCapabilities = {
      audioGeneration: isAudioGenerationAvailable(),
      textGeneration: isTextGenerationAvailable(),
    };

    return { success: true, data: capabilities };
  });
}
