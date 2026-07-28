import type { AgentConfig } from "@crow-central-agency/shared";
import { TOOL_DISPOSITION, type CustomRuleDisposition } from "./tool-permission.js";

export interface PermissionRuleUsage {
  rule: string;
  approvedCount: number;
  deniedCount: number;
}

function tallyRules(
  usageByRule: Map<string, PermissionRuleUsage>,
  rules: string[] | undefined,
  disposition: CustomRuleDisposition
): void {
  for (const rule of new Set(rules)) {
    const usage = usageByRule.get(rule) ?? { rule, approvedCount: 0, deniedCount: 0 };

    if (disposition === TOOL_DISPOSITION.APPROVE) {
      usage.approvedCount += 1;
    } else {
      usage.deniedCount += 1;
    }

    usageByRule.set(rule, usage);
  }
}

export function collectPermissionRuleUsage(agents: AgentConfig[]): PermissionRuleUsage[] {
  const usageByRule = new Map<string, PermissionRuleUsage>();

  for (const agent of agents) {
    tallyRules(usageByRule, agent.toolConfig?.autoApprovedTools, TOOL_DISPOSITION.APPROVE);
    tallyRules(usageByRule, agent.toolConfig?.disallowedTools, TOOL_DISPOSITION.DENY);
  }

  return [...usageByRule.values()].sort((left, right) => {
    const totalDifference = right.approvedCount + right.deniedCount - (left.approvedCount + left.deniedCount);
    if (totalDifference !== 0) {
      return totalDifference;
    }

    // Codepoint, not locale: rules are case-sensitive and must not depend on runtime collation.
    return left.rule < right.rule ? -1 : 1;
  });
}

export function dispositionForUsage(usage: PermissionRuleUsage): CustomRuleDisposition {
  return usage.deniedCount > 0 && usage.approvedCount === 0 ? TOOL_DISPOSITION.DENY : TOOL_DISPOSITION.APPROVE;
}
