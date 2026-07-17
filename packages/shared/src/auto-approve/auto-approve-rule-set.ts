import type { ParsedRule } from "./auto-approve-rule.types.js";
import { SUBCOMMAND_MATCH_MODE, type SubcommandMatchMode } from "./command-decomposition.js";
import { parseRule } from "./rule-format.js";
import { getRuleStrategy } from "./rule-strategy-registry.js";

/**
 * A mutable set of auto-approve rule strings that parses each rule once and caches the result, so
 * permission checks match against the pre-parsed rules instead of re-parsing the whole list per call.
 * Raw strings are deduped; malformed rules are dropped on add (same as `parseRules`).
 */
export class AutoApproveRuleSet {
  private readonly raw = new Set<string>();
  private readonly parsed: ParsedRule[] = [];

  constructor(initialRules: Iterable<string> = []) {
    this.add(initialRules);
  }

  public add(rules: Iterable<string>): void {
    for (const rule of rules) {
      if (this.raw.has(rule)) {
        continue;
      }

      this.raw.add(rule);
      const parsedRule = parseRule(rule);
      if (parsedRule !== undefined) {
        this.parsed.push(parsedRule);
      }
    }
  }

  public matches(
    toolName: string,
    input: Record<string, unknown>,
    mode: SubcommandMatchMode = SUBCOMMAND_MATCH_MODE.ALL
  ): boolean {
    return getRuleStrategy(toolName).matches(toolName, input, this.parsed, mode);
  }
}
