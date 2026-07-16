import { parseRule } from "@crow-central-agency/shared";

/**
 * A single permission rule as rendered within a group. `rule` is the canonical string that keys the
 * row's disposition and handlers; `displayName` is what the row shows; `removable` is per-row (true
 * iff the rule is not part of the catalog).
 */
export interface PermissionRuleEntry {
  rule: string;
  displayName: string;
  removable: boolean;
}

/** A labelled bucket of permission entries rendered together in the list. */
export interface PermissionGroup {
  key: string;
  label: string;
  entries: PermissionRuleEntry[];
}

const BUILTIN_GROUP_KEY = "builtin";
const BUILTIN_GROUP_LABEL = "Built-in";
const MCP_GROUP_KEY_PREFIX = "mcp:";
const MCP_PREFIX = "mcp__";
const MCP_SEGMENT_SEPARATOR = "__";
const WILDCARD_DISPLAY = "*";

/**
 * Join between an external MCP server name and its tool as observed in Copilot's tool-event names
 * (`${server}-${tool}`). This is the provider's format, not one we assign — used only as a
 * best-effort heuristic to regroup external tools under their server.
 */
const SERVER_TOOL_SEPARATOR = "-";

/**
 * Best-effort match of a tool name left over from the `mcp__` branch against the agent's known
 * external MCP server names (Copilot external servers). Picks the longest matching server name so
 * overlapping names disambiguate (e.g. `a` vs `a-b` for `a-b-foo`). Returns the server and the
 * remainder tool segment, or undefined when nothing matches.
 */
function matchExternalMcpServer(
  tool: string,
  knownMcpServerNames: string[]
): { server: string; remainder: string } | undefined {
  let matched: { server: string; remainder: string } | undefined;
  for (const server of knownMcpServerNames) {
    const prefix = `${server}${SERVER_TOOL_SEPARATOR}`;
    if (tool.startsWith(prefix) && (matched === undefined || server.length > matched.server.length)) {
      matched = { server, remainder: tool.slice(prefix.length) };
    }
  }

  return matched;
}

/**
 * Split the built-in catalog into a single Built-in group plus one group per MCP server, and bucket
 * remaining custom rules by tool name. Catalog MCP tools and custom `mcp__server__*` rules for the
 * same server merge into that server's group so a wildcard sits next to its specific tools. Group
 * order is Built-in, then MCP servers, then by-tool custom groups (each in first-appearance order).
 *
 * `knownMcpServerNames` are the agent's normalized external MCP server names. Tools we name ourselves
 * (`mcp__server__tool`: Claude Code + Copilot internal) group generically; external tools Copilot
 * names `${server}-${tool}` are then best-effort regrouped under a matching known server.
 */
export function buildPermissionGroups(
  catalogRules: string[],
  customRules: string[],
  knownMcpServerNames: string[]
): PermissionGroup[] {
  const catalogSet = new Set(catalogRules);
  const groupsByKey = new Map<string, PermissionGroup>();

  const groupFor = (key: string, label: string): PermissionGroup => {
    const existing = groupsByKey.get(key);
    if (existing) {
      return existing;
    }

    const group: PermissionGroup = { key, label, entries: [] };
    groupsByKey.set(key, group);
    return group;
  };

  for (const rule of [...catalogRules, ...customRules]) {
    const parsed = parseRule(rule);
    const tool = parsed?.tool ?? rule;
    const removable = !catalogSet.has(rule);

    if (tool.startsWith(MCP_PREFIX)) {
      const server = tool.split(MCP_SEGMENT_SEPARATOR)[1];
      if (server !== undefined && server.length > 0) {
        const remainder = tool.slice(MCP_PREFIX.length + server.length + MCP_SEGMENT_SEPARATOR.length);
        const baseName = remainder.length > 0 ? remainder : WILDCARD_DISPLAY;
        const displayName = parsed?.specifier !== undefined ? `${baseName}(${parsed.specifier})` : baseName;
        groupFor(`${MCP_GROUP_KEY_PREFIX}${server}`, server).entries.push({ rule, displayName, removable });
        continue;
      }
    }

    const externalMatch = matchExternalMcpServer(tool, knownMcpServerNames);
    if (externalMatch !== undefined) {
      const { server, remainder } = externalMatch;
      const baseName = remainder.length > 0 ? remainder : WILDCARD_DISPLAY;
      const displayName = parsed?.specifier !== undefined ? `${baseName}(${parsed.specifier})` : baseName;
      groupFor(`${MCP_GROUP_KEY_PREFIX}${server}`, server).entries.push({ rule, displayName, removable });
      continue;
    }

    if (catalogSet.has(rule)) {
      groupFor(BUILTIN_GROUP_KEY, BUILTIN_GROUP_LABEL).entries.push({ rule, displayName: tool, removable });
    } else {
      groupFor(`custom:${tool}`, tool).entries.push({ rule, displayName: rule, removable });
    }
  }

  const builtinGroups: PermissionGroup[] = [];
  const mcpGroups: PermissionGroup[] = [];
  const customGroups: PermissionGroup[] = [];
  for (const group of groupsByKey.values()) {
    if (group.key === BUILTIN_GROUP_KEY) {
      builtinGroups.push(group);
    } else if (group.key.startsWith(MCP_GROUP_KEY_PREFIX)) {
      mcpGroups.push(group);
    } else {
      customGroups.push(group);
    }
  }

  return [...builtinGroups, ...mcpGroups, ...customGroups];
}
