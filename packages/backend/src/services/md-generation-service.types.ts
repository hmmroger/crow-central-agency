/** Supported generation types */
export const GENERATION_TYPE = {
  PERSONA: "persona",
  AGENT_MD: "agentmd",
} as const;

export type GenerationType = (typeof GENERATION_TYPE)[keyof typeof GENERATION_TYPE];

/** Input for the text generation service */
export interface GenerateTextInput {
  /** What kind of content to generate */
  type: GenerationType;
  /** User's prompt describing what to generate */
  prompt: string;
  /** Optional context to include (e.g. existing persona, agent description) */
  context?: string;
}
