import { useCallback, useMemo, useState } from "react";
import { PermissionGroup } from "./permission-group.js";
import { buildPermissionGroups } from "./permission-grouping.js";
import { TOOL_DISPOSITION, type ToolDisposition } from "./tool-permission.js";

interface PermissionListProps {
  effectiveTools: string[];
  autoApprovedTools: string[];
  disallowedTools: string[];
  filter: string;
  onSetToolPermission: (rule: string, disposition: ToolDisposition) => void;
}

/**
 * Unified permission rows grouped by prefix: catalog tools first (not removable), then custom rules
 * bucketed by their leading segment (removable). The `filter` narrows visible rows across all groups;
 * the filter input itself is owned by the parent so it can stay fixed above the scroll region.
 */
export function PermissionList({
  effectiveTools,
  autoApprovedTools,
  disallowedTools,
  filter,
  onSetToolPermission,
}: PermissionListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const customRules = [...new Set([...autoApprovedTools, ...disallowedTools])].filter(
      (rule) => !effectiveTools.includes(rule)
    );

    return buildPermissionGroups(effectiveTools, customRules);
  }, [effectiveTools, autoApprovedTools, disallowedTools]);

  const handleToggleCollapsed = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }

      return next;
    });
  }, []);

  const handleRemove = useCallback(
    (rule: string) => onSetToolPermission(rule, TOOL_DISPOSITION.ASK),
    [onSetToolPermission]
  );

  if (groups.length === 0) {
    return undefined;
  }

  const normalizedFilter = filter.trim().toLowerCase();
  const hasFilter = normalizedFilter.length > 0;

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const visibleEntries = hasFilter
          ? group.entries.filter((entry) => entry.rule.toLowerCase().includes(normalizedFilter))
          : group.entries;

        if (visibleEntries.length === 0) {
          return undefined;
        }

        return (
          <PermissionGroup
            key={group.key}
            groupKey={group.key}
            label={group.label}
            entries={visibleEntries}
            collapsed={collapsedGroups.has(group.key) && !hasFilter}
            autoApprovedTools={autoApprovedTools}
            disallowedTools={disallowedTools}
            onToggleCollapsed={handleToggleCollapsed}
            onSetToolPermission={onSetToolPermission}
            onRemove={handleRemove}
          />
        );
      })}
    </div>
  );
}
