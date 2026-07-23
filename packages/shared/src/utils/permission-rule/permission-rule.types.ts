/**
 * A single permission rule in the Claude SDK's canonical form: `Tool` or `Tool(specifier)`.
 * The `specifier` is absent for whole-tool rules (`Write`, `*`, `mcp__crow-artifacts__*`) and
 * present for scoped rules (`Bash(git commit *)`).
 */
export interface ParsedRule {
  tool: string;
  specifier?: string;
}
