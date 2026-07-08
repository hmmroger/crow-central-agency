import { parseRule } from "@crow-central-agency/shared";

/** A labelled bucket of permission rules rendered together in the list. */
export interface PermissionGroup {
  key: string;
  label: string;
  removable: boolean;
  rules: string[];
}

export const CATALOG_GROUP_KEY = "catalog";
const CATALOG_GROUP_LABEL = "Catalog";
const MCP_PREFIX = "mcp__";
const MCP_SEGMENT_SEPARATOR = "__";

/**
 * Derive a custom rule's group label from its leading segment. For `mcp__server__tool` rules the
 * server segment groups them together; every other rule groups by its tool name (the part before a
 * specifier). Pure string logic — no tool-catalog assumptions, so it stays correct for unknown tools.
 */
function customGroupLabel(rule: string): string {
  const tool = parseRule(rule)?.tool ?? rule;

  if (tool.startsWith(MCP_PREFIX)) {
    const segments = tool.split(MCP_SEGMENT_SEPARATOR);
    if (segments.length >= 2 && segments[1].length > 0) {
      return segments[1];
    }
  }

  return tool;
}

/**
 * Build the ordered permission groups: catalog rules stay as a single leading group, then custom
 * rules are grouped by prefix (first-seen order) so a wildcard sits next to its specific exception.
 */
export function buildPermissionGroups(catalogRules: string[], customRules: string[]): PermissionGroup[] {
  const groups: PermissionGroup[] = [];

  if (catalogRules.length > 0) {
    groups.push({ key: CATALOG_GROUP_KEY, label: CATALOG_GROUP_LABEL, removable: false, rules: catalogRules });
  }

  const rulesByLabel = new Map<string, string[]>();
  for (const rule of customRules) {
    const label = customGroupLabel(rule);
    const existing = rulesByLabel.get(label);
    if (existing) {
      existing.push(rule);
    } else {
      rulesByLabel.set(label, [rule]);
    }
  }

  for (const [label, rules] of rulesByLabel) {
    groups.push({ key: `custom:${label}`, label, removable: true, rules });
  }

  return groups;
}
