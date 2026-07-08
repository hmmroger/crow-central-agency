import type { AutoApproveRuleStrategy } from "./auto-approve-rule.types.js";
import { commandRuleStrategy, defaultRuleStrategy } from "./rule-strategies.js";

const REGISTERED_STRATEGIES: AutoApproveRuleStrategy[] = [commandRuleStrategy];

/** Resolve the auto-approve strategy for a tool, falling back to the default whole-tool strategy. */
export function getRuleStrategy(toolName: string): AutoApproveRuleStrategy {
  return REGISTERED_STRATEGIES.find((strategy) => strategy.appliesTo(toolName)) ?? defaultRuleStrategy;
}
