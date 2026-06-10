import { z } from "zod";
import { ModelOptionSchema } from "./agent.schema.js";

/**
 * Server-side feature flags surfaced to the UI so it can enable/disable
 * features whose backing services are configured via environment variables.
 */
export const SystemCapabilitiesSchema = z.object({
  /** True when the audio generation provider, API key, and model are all configured. */
  audioGeneration: z.boolean(),
  /** True when the chat-completion text generation provider is configured (powers persona / AGENT.md generation). */
  textGeneration: z.boolean(),
  /** True when the shared Copilot SDK client started successfully (Copilot agents can run). */
  copilotAvailable: z.boolean(),
  /** Models selectable for Claude Code agents. */
  claudeSupportedModels: z.array(ModelOptionSchema),
  /** Models selectable for Copilot agents, fetched from the SDK; empty when Copilot is unavailable. */
  copilotSupportedModels: z.array(ModelOptionSchema),
});

export type SystemCapabilities = z.infer<typeof SystemCapabilitiesSchema>;
