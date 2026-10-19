import { CLAUDE_CODE_TOOL, formatRule, GLOB_STAR, type ParsedRule } from "@crow-central-agency/shared";
import type { PermissionRuleStrategy } from "./permission-rule-strategy.types.js";
import { deriveCommandRules, deriveNewCommandRules, matchesCommandRules } from "./command-decomposition.js";
import { SHELL, type ShellDialect } from "./shell-grammar.js";
import { USER_NOTES_PERMISSION_SCOPE_FIELDS } from "../../mcp/user-notes/user-notes-mcp-server.js";

/** Input field carrying the shell command for Bash/PowerShell tools. */
const COMMAND_INPUT_KEY = "command";

/**
 * Command-scoped tools, compared case-insensitively to cover Claude (`Bash`, `PowerShell`) and
 * GitHub Copilot (`bash`, `powershell`).
 */
const COMMAND_TOOL_BASE_NAMES = new Set([
  CLAUDE_CODE_TOOL.BASH.toLowerCase(),
  CLAUDE_CODE_TOOL.POWER_SHELL.toLowerCase(),
]);

/**
 * Resolve the shell grammar governing decomposition from the command tool name (case-insensitive),
 * so a `\"` is read as a literal quote under Bash but a path char under PowerShell. Non-PowerShell
 * command tools default to Bash.
 */
function resolveShell(toolName: string): ShellDialect {
  return toolName.toLowerCase() === CLAUDE_CODE_TOOL.POWER_SHELL.toLowerCase() ? SHELL.POWERSHELL : SHELL.BASH;
}

/**
 * Whole-tool matching: case-insensitive exact tool-name match, plus a trailing `*` (including a bare
 * `*` and MCP prefixes like `mcp__crow-artifacts__*`) as a prefix match. Case-insensitivity aligns
 * with the command strategy (which lowercases the tool name) so a `Bash` rule covers Copilot's
 * `bash`, for both allow and deny.
 */
function wholeToolMatches(toolName: string, rules: ParsedRule[]): boolean {
  const targetTool = toolName.toLowerCase();
  for (const rule of rules) {
    if (rule.specifier !== undefined) {
      continue;
    }

    const pattern = rule.tool.toLowerCase();
    if (pattern === targetTool) {
      return true;
    }

    if (pattern.endsWith(GLOB_STAR) && targetTool.startsWith(pattern.slice(0, -GLOB_STAR.length))) {
      return true;
    }
  }

  return false;
}

function extractCommand(input: Record<string, unknown>): string | undefined {
  const command = input[COMMAND_INPUT_KEY];
  return typeof command === "string" ? command : undefined;
}

/** Default strategy: today's whole-tool behavior, used for any tool without a specialization. */
export const defaultRuleStrategy: PermissionRuleStrategy = {
  appliesTo: () => true,
  deriveRules: (toolName) => [toolName],
  deriveNewRules: (toolName) => [toolName],
  matches: (toolName, _input, rules) => wholeToolMatches(toolName, rules),
};

/** Collect the specifiers of `rules` scoped to a single tool (case-insensitive), ignoring whole-tool rules. */
function specifiersForTool(toolName: string, rules: ParsedRule[]): string[] {
  const targetTool = toolName.toLowerCase();
  const specifiers: string[] = [];
  for (const rule of rules) {
    if (rule.specifier !== undefined && rule.tool.toLowerCase() === targetTool) {
      specifiers.push(rule.specifier);
    }
  }

  return specifiers;
}

/** Command strategy: Bash/PowerShell decomposition on top of the whole-tool behavior. */
export const commandRuleStrategy: PermissionRuleStrategy = {
  appliesTo: (toolName) => COMMAND_TOOL_BASE_NAMES.has(toolName.toLowerCase()),

  deriveRules: (toolName, input) => {
    const command = extractCommand(input);
    if (command === undefined) {
      return [];
    }

    return deriveCommandRules(command, resolveShell(toolName)).map((specifier) =>
      formatRule({ tool: toolName, specifier })
    );
  },

  deriveNewRules: (toolName, input, existingRules) => {
    const command = extractCommand(input);
    if (command === undefined) {
      return [];
    }

    const existingSpecifiers = specifiersForTool(toolName, existingRules);
    return deriveNewCommandRules(command, existingSpecifiers, resolveShell(toolName)).map((specifier) =>
      formatRule({ tool: toolName, specifier })
    );
  },

  matches: (toolName, input, rules, mode) => {
    if (wholeToolMatches(toolName, rules)) {
      return true;
    }

    const command = extractCommand(input);
    if (command === undefined) {
      return false;
    }

    return matchesCommandRules(command, specifiersForTool(toolName, rules), resolveShell(toolName), mode);
  },
};

/** The note id a notes tool call acts on; undefined for the notes root, which has none. */
function extractNoteId(toolName: string, input: Record<string, unknown>): string | undefined {
  const field = USER_NOTES_PERMISSION_SCOPE_FIELDS.get(toolName.toLowerCase());
  const noteId = field === undefined ? undefined : input[field];
  // The tools read an empty folderId as the root, so it must not fall under `(*)`.
  return typeof noteId === "string" && noteId.length > 0 ? noteId : undefined;
}

function matchesNotePattern(noteId: string, pattern: string): boolean {
  const normalizedId = noteId.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();
  return normalizedPattern.endsWith(GLOB_STAR)
    ? normalizedId.startsWith(normalizedPattern.slice(0, -GLOB_STAR.length))
    : normalizedId === normalizedPattern;
}

function deriveNoteRules(toolName: string, input: Record<string, unknown>): string[] {
  const noteId = extractNoteId(toolName, input);
  return [noteId === undefined ? toolName : formatRule({ tool: toolName, specifier: noteId })];
}

/** Notes strategy: `crow-user-notes` tools scoped by the note or folder id they act on. */
export const noteRuleStrategy: PermissionRuleStrategy = {
  appliesTo: (toolName) => USER_NOTES_PERMISSION_SCOPE_FIELDS.has(toolName.toLowerCase()),
  deriveRules: deriveNoteRules,
  deriveNewRules: deriveNoteRules,
  matches: (toolName, input, rules) => {
    if (wholeToolMatches(toolName, rules)) {
      return true;
    }

    const noteId = extractNoteId(toolName, input);
    if (noteId === undefined) {
      return false;
    }

    return specifiersForTool(toolName, rules).some((pattern) => matchesNotePattern(noteId, pattern));
  },
};
