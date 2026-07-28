import { AGENT_TYPE, DEFAULT_AVAILABLE_TOOLS_BY_TYPE, type AgentType } from "@crow-central-agency/shared";

/** Builtin tool name sets per provider, for separating builtins from external (MCP) tools. */
export const BUILTIN_TOOL_SET_BY_TYPE: Record<AgentType, ReadonlySet<string>> = {
  [AGENT_TYPE.CLAUDE_CODE]: new Set(DEFAULT_AVAILABLE_TOOLS_BY_TYPE[AGENT_TYPE.CLAUDE_CODE]),
  [AGENT_TYPE.GITHUB_COPILOT]: new Set(DEFAULT_AVAILABLE_TOOLS_BY_TYPE[AGENT_TYPE.GITHUB_COPILOT]),
};

export const BUILTIN_TOOL_SET_ALL_TYPES: ReadonlySet<string> = new Set(
  Object.values(DEFAULT_AVAILABLE_TOOLS_BY_TYPE).flat()
);

export const MCP_PREFIX = "mcp__";
export const MCP_SEGMENT_SEPARATOR = "__";
