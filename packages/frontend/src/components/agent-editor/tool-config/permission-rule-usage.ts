import type { AgentConfig } from "@crow-central-agency/shared";
import { TOOL_DISPOSITION, type CustomRuleDisposition } from "./tool-permission.js";

/** How many agents in the fleet hold one permission rule, under each disposition. */
export interface PermissionRuleUsage {
  rule: string;
  /** Agents that currently auto-approve this rule. */
  approvedCount: number;
  /** Agents that currently deny it. */
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

/**
 * Union of every permission rule configured across the given agents, deduped by exact string.
 * Rules are case-sensitive and are never canonicalized — the runtime matches them literally, so two
 * spellings of an equivalent rule stay distinct entries. The same rule can be approved by one agent
 * and denied by another, in which case both counts are non-zero.
 *
 * Ordered by total agents descending, then rule ascending, so widely shared rules surface first.
 */
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

    // Codepoint order, not locale: rules are case-sensitive, so "Bash(ls)" and "bash(ls)" need a
    // stable relative position rather than one that depends on the runtime's collation.
    return left.rule < right.rule ? -1 : 1;
  });
}

/**
 * Disposition to install when this rule is copied onto another agent. Denied-only rules carry their
 * Deny across: copying another agent's `Bash(rm -rf *)` deny as an auto-approve would invert its
 * intent without the user seeing it.
 */
export function dispositionForUsage(usage: PermissionRuleUsage): CustomRuleDisposition {
  return usage.deniedCount > 0 && usage.approvedCount === 0 ? TOOL_DISPOSITION.DENY : TOOL_DISPOSITION.APPROVE;
}
