export const CLAUDE_MODELS = {
  HAIKU: "claude-haiku-4-5",
  SONNET: "claude-sonnet-4-6",
  OPUS: "claude-opus-4-6",
} as const;

export const CLAUDE_CODE_MODEL_OPTIONS = [
  { value: CLAUDE_MODELS.SONNET, label: "Claude Sonnet 4.6" },
  { value: CLAUDE_MODELS.OPUS, label: "Claude Opus 4.6" },
  { value: CLAUDE_MODELS.HAIKU, label: "Claude Haiku 4.5" },
] as const;
