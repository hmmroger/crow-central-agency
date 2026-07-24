import { commandRuleStrategy, defaultRuleStrategy } from "./rule-strategies.js";
import type { PermissionRuleStrategy } from "./permission-rule-strategy.types.js";

const REGISTERED_STRATEGIES: PermissionRuleStrategy[] = [commandRuleStrategy];

/** Resolve the permission-rule strategy for a tool, falling back to the default whole-tool strategy. */
export function getRuleStrategy(toolName: string): PermissionRuleStrategy {
  return REGISTERED_STRATEGIES.find((strategy) => strategy.appliesTo(toolName)) ?? defaultRuleStrategy;
}
