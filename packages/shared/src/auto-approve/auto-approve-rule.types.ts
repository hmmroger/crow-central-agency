import type { SubcommandMatchMode } from "./command-decomposition.js";

/**
 * A single auto-approve rule in the Claude SDK's canonical form: `Tool` or `Tool(specifier)`.
 * The `specifier` is absent for whole-tool rules (`Write`, `*`, `mcp__crow-artifacts__*`) and
 * present for scoped rules (`Bash(git commit *)`).
 */
export interface ParsedRule {
  tool: string;
  specifier?: string;
}

/**
 * Pluggable per-tool auto-approve behavior. The registry dispatches on tool name and falls back
 * to the default (whole-tool) strategy for any unregistered tool.
 */
export interface AutoApproveRuleStrategy {
  /** Whether this strategy handles the given tool. */
  appliesTo(toolName: string): boolean;
  /** Capture side: derive the rule string(s) to persist when the user picks "always allow". */
  deriveRules(toolName: string, input: Record<string, unknown>): string[];
  /**
   * Diff-aware capture: like {@link deriveRules} but returns only the rule string(s) not already
   * covered by `existingRules` (the rule set's own parsed rules), so a compound command surfaces
   * nothing for subcommands an existing rule already approves.
   */
  deriveNewRules(toolName: string, input: Record<string, unknown>, existingRules: ParsedRule[]): string[];
  /**
   * Match side: whether the pending invocation matches the configured rules. `mode` governs how a
   * compound command aggregates its subcommands (`ALL` for approve, `ANY` for deny).
   */
  matches(toolName: string, input: Record<string, unknown>, rules: ParsedRule[], mode?: SubcommandMatchMode): boolean;
}
