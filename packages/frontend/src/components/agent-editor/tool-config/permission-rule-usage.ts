import { GLOB_STAR, parseRule, type AgentConfig } from "@crow-central-agency/shared";
import { BUILTIN_TOOL_SET_ALL_TYPES, MCP_PREFIX, MCP_SEGMENT_SEPARATOR } from "./tool-constants.js";
import { TOOL_DISPOSITION, type CustomRuleDisposition } from "./tool-permission.js";

export interface PermissionRuleUsage {
  rule: string;
  approvedCount: number;
  deniedCount: number;
}

/**
 * A rule the permission list already renders as its own row once the agent has run, so offering it
 * here would only duplicate a chip the user can click. Covers both providers' builtins and the tools
 * of internal configurable MCP servers. Patterns are never catalog rows, so `Bash(git commit *)` and
 * `mcp__crow-places__*` stay in the list even though their tool is a builtin or internal.
 */
function isCatalogTool(rule: string, internalMcpPrefixes: string[]): boolean {
  const parsed = parseRule(rule);
  if (parsed === undefined || parsed.specifier !== undefined || parsed.tool.includes(GLOB_STAR)) {
    return false;
  }

  return (
    BUILTIN_TOOL_SET_ALL_TYPES.has(parsed.tool) || internalMcpPrefixes.some((prefix) => parsed.tool.startsWith(prefix))
  );
}

function tallyRules(
  usageByRule: Map<string, PermissionRuleUsage>,
  rules: string[] | undefined,
  disposition: CustomRuleDisposition,
  internalMcpPrefixes: string[]
): void {
  for (const rule of new Set(rules)) {
    if (isCatalogTool(rule, internalMcpPrefixes)) {
      continue;
    }

    const usage = usageByRule.get(rule) ?? { rule, approvedCount: 0, deniedCount: 0 };

    if (disposition === TOOL_DISPOSITION.APPROVE) {
      usage.approvedCount += 1;
    } else {
      usage.deniedCount += 1;
    }

    usageByRule.set(rule, usage);
  }
}

export function collectPermissionRuleUsage(
  agents: AgentConfig[],
  internalMcpServerNames: string[]
): PermissionRuleUsage[] {
  const usageByRule = new Map<string, PermissionRuleUsage>();
  const internalMcpPrefixes = internalMcpServerNames.map((name) => `${MCP_PREFIX}${name}${MCP_SEGMENT_SEPARATOR}`);

  for (const agent of agents) {
    tallyRules(usageByRule, agent.toolConfig?.autoApprovedTools, TOOL_DISPOSITION.APPROVE, internalMcpPrefixes);
    tallyRules(usageByRule, agent.toolConfig?.disallowedTools, TOOL_DISPOSITION.DENY, internalMcpPrefixes);
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
