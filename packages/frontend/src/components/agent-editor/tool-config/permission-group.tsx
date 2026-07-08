import { useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../../utils/cn.js";
import { PermissionRow } from "./permission-row.js";
import type { PermissionRuleEntry } from "./permission-grouping.js";
import { dispositionForRule, type ToolDisposition } from "./tool-permission.js";

interface PermissionGroupProps {
  groupKey: string;
  label: string;
  entries: PermissionRuleEntry[];
  collapsed: boolean;
  autoApprovedTools: string[];
  disallowedTools: string[];
  onToggleCollapsed: (groupKey: string) => void;
  onSetToolPermission: (rule: string, disposition: ToolDisposition) => void;
  onRemove: (rule: string) => void;
}

/** A labelled, collapsible group of permission rows. */
export function PermissionGroup({
  groupKey,
  label,
  entries,
  collapsed,
  autoApprovedTools,
  disallowedTools,
  onToggleCollapsed,
  onSetToolPermission,
  onRemove,
}: PermissionGroupProps) {
  const handleToggle = useCallback(() => onToggleCollapsed(groupKey), [onToggleCollapsed, groupKey]);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="flex items-center gap-1.5 group"
        onClick={handleToggle}
        aria-expanded={!collapsed}
      >
        <ChevronRight
          className={cn("h-3 w-3 text-text-muted transition-transform duration-150", !collapsed && "rotate-90")}
        />
        <span className="text-3xs font-medium uppercase tracking-widest text-text-muted group-hover:text-text-neutral transition-colors">
          {label}
        </span>
        <span className="text-3xs text-text-muted/60">{entries.length}</span>
      </button>

      {!collapsed && (
        <div className="space-y-1.5 pl-4">
          {entries.map((entry) => (
            <PermissionRow
              key={entry.rule}
              rule={entry.rule}
              displayName={entry.displayName}
              disposition={dispositionForRule(entry.rule, autoApprovedTools, disallowedTools)}
              removable={entry.removable}
              onDispositionChange={onSetToolPermission}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
