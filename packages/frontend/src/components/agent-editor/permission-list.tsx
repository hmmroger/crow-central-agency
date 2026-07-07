import { useCallback, useMemo } from "react";
import { PermissionRow } from "./permission-row.js";
import { TOOL_DISPOSITION, dispositionForRule, type ToolDisposition } from "./tool-permission.js";

interface PermissionListProps {
  effectiveTools: string[];
  autoApprovedTools: string[];
  disallowedTools: string[];
  onSetToolPermission: (rule: string, disposition: ToolDisposition) => void;
}

interface PermissionRowEntry {
  rule: string;
  removable: boolean;
}

/**
 * Unified permission rows: catalog tools first (not removable), then user-configured custom rules
 * that fall outside the catalog (removable). Each row derives its disposition from the backing arrays.
 */
export function PermissionList({
  effectiveTools,
  autoApprovedTools,
  disallowedTools,
  onSetToolPermission,
}: PermissionListProps) {
  const rows = useMemo<PermissionRowEntry[]>(() => {
    const customRules = [...new Set([...autoApprovedTools, ...disallowedTools])].filter(
      (rule) => !effectiveTools.includes(rule)
    );

    return [
      ...effectiveTools.map((rule) => ({ rule, removable: false })),
      ...customRules.map((rule) => ({ rule, removable: true })),
    ];
  }, [effectiveTools, autoApprovedTools, disallowedTools]);

  const handleRemove = useCallback(
    (rule: string) => onSetToolPermission(rule, TOOL_DISPOSITION.ASK),
    [onSetToolPermission]
  );

  return (
    <div className="space-y-1.5">
      {rows.map(({ rule, removable }) => (
        <PermissionRow
          key={rule}
          rule={rule}
          disposition={dispositionForRule(rule, autoApprovedTools, disallowedTools)}
          removable={removable}
          onDispositionChange={onSetToolPermission}
          onRemove={handleRemove}
        />
      ))}
    </div>
  );
}
