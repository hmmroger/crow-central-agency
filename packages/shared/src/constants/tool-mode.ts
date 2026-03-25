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
  "AskUserQuestion",
  "Bash",
  "Glob",
  "Grep",
  "Read",
  "Edit",
  "Write",
  "WebFetch",
  "WebSearch",
  "Task",
  "TaskOutput",
  "TaskStop",
  "TodoWrite",
  "NotebookEdit",
  "Skill",
  "EnterPlanMode",
  "ExitPlanMode",
  "EnterWorktree",
  "ExitWorktree",
  "CronCreate",
  "CronDelete",
  "CronList",
  "ToolSearch",
] as const;
