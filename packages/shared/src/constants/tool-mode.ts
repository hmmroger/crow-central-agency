/**
 * Tool configuration modes for agent tool availability.
 */
export const TOOL_MODE = {
  /** All tools available — pass undefined to SDK */
  UNRESTRICTED: "unrestricted",
  /** User-selected tool subset — pass explicit string[] to SDK */
  RESTRICTED: "restricted",
} as const;

export type ToolMode = (typeof TOOL_MODE)[keyof typeof TOOL_MODE];

/** The SDK tool name used to launch a subagent */
export const SUBAGENT_TOOL_NAME = "Agent" as const;

/**
 * Default available tools for new agent creation.
 * These are known builtin Claude Code tools. After first query,
 * SDKSystemMessage init provides the full tool list which replaces this.
 */
export const DEFAULT_AVAILABLE_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "LS",
  "Agent",
  "WebFetch",
  "WebSearch",
  "Skill",
  "NotebookEdit",
  "NotebookRead",
  "TodoWrite",
] as const;
