import { z } from "zod";

/**
 * Server-side feature flags surfaced to the UI so it can enable/disable
 * features whose backing services are configured via environment variables.
 */
export const SystemCapabilitiesSchema = z.object({
  /** True when the audio generation provider, API key, and model are all configured. */
  audioGeneration: z.boolean(),
  /** True when the chat-completion text generation provider is configured (powers persona / AGENT.md generation). */
  textGeneration: z.boolean(),
});

export type SystemCapabilities = z.infer<typeof SystemCapabilitiesSchema>;
