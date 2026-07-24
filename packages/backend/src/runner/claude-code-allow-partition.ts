import { parseRule } from "@crow-central-agency/shared";
import { getRuleStrategy } from "./permission-rule/rule-strategy-registry.js";
import { defaultRuleStrategy } from "./permission-rule/rule-strategies.js";

/**
 * Split of config allow-rules by who evaluates them: rules our `PermissionRuleSet` can match
 * (`ownedByMatcher`) versus specifier rules we hand back to the Claude SDK's native `allowedTools`
 * (`delegatedToNative`) — the reference matcher for path/domain specifiers we can't yet express.
 */
export interface AllowRulePartition {
  ownedByMatcher: string[];
  delegatedToNative: string[];
}

/**
 * Partition config allow-rules for the Claude runner. A specifier rule on a tool with no
 * specialized strategy (i.e. the default whole-tool strategy skips its specifier) is delegated to
 * native `allowedTools`; everything else — whole-tool rules, command-tool specifier rules, and
 * malformed rules — stays owned by our matcher. Preserves input order in both buckets.
 */
export function partitionAllowRules(rules: string[]): AllowRulePartition {
  const ownedByMatcher: string[] = [];
  const delegatedToNative: string[] = [];

  for (const rule of rules) {
    const parsed = parseRule(rule);
    if (parsed?.specifier !== undefined && getRuleStrategy(parsed.tool) === defaultRuleStrategy) {
      delegatedToNative.push(rule);
    } else {
      ownedByMatcher.push(rule);
    }
  }

  return { ownedByMatcher, delegatedToNative };
}
