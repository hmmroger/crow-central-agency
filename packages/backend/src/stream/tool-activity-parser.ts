import { SUBAGENT_TOOL_NAME } from "@crow-central-agency/shared";

/** Type guard — returns true when value is a non-null, non-array object */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extracts a human-readable description from a tool name and its input.
 * Used to build agent_activity WS messages from SDK stream events.
 */
export function parseToolActivity(toolName: string, rawInput: unknown): string {
  const toolInput: Record<string, unknown> = isRecord(rawInput) ? rawInput : {};
  switch (toolName) {
    case "Read":
      return `Reading ${toolInput.file_path ?? "file"}`;

    case "Write":
      return `Writing ${toolInput.file_path ?? "file"}`;

    case "Edit":
      return `Editing ${toolInput.file_path ?? "file"}`;

    case "Bash": {
      if (toolInput.description) {
        return String(toolInput.description);
      }

      const command = String(toolInput.command ?? "");
      const truncated = command.length > 80 ? command.slice(0, 77) + "..." : command;

      return `Running: ${truncated}`;
    }

    case "Glob": {
      const pattern = toolInput.pattern ?? "*";
      const searchPath = toolInput.path ? ` in ${toolInput.path}` : "";

      return `Searching for ${pattern}${searchPath}`;
    }

    case "Grep": {
      const grepPattern = toolInput.pattern ?? "";
      const grepPath = toolInput.path ? ` in ${toolInput.path}` : "";

      return `Searching for '${grepPattern}'${grepPath}`;
    }

    case "WebFetch":
      return `Fetching ${toolInput.url ?? "URL"}`;

    case "WebSearch":
      return `Searching: ${toolInput.query ?? ""}`;

    case SUBAGENT_TOOL_NAME:
      return `Launching subagent: ${toolInput.description ?? toolInput.prompt ?? "task"}`;

    case "Skill":
      return `Using skill: ${toolInput.skill ?? ""}`;

    case "LS":
      return `Listing ${toolInput.path ?? "."}`;

    case "NotebookEdit":
      return `Editing notebook ${toolInput.notebook_path ?? ""}`;

    case "NotebookRead":
      return `Reading notebook ${toolInput.notebook_path ?? ""}`;

    default: {
      // MCP tools or unknown tools — show tool name + first key input
      const firstKey = Object.keys(toolInput)[0];
      const firstValue = firstKey ? String(toolInput[firstKey]).slice(0, 50) : "";

      return firstKey ? `${firstKey}=${firstValue}` : "";
    }
  }
}
