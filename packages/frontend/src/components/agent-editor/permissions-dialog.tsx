import { useCallback, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { formatRule, parseRule } from "@crow-central-agency/shared";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { PermissionList } from "./permission-list.js";
import { addCustomPermission, applyPermission, type ToolDisposition, type ToolPermissions } from "./tool-permission.js";

interface PermissionsDialogProps {
  effectiveTools: string[];
  autoApprovedTools: string[];
  disallowedTools: string[];
  onSave: (autoApprovedTools: string[], disallowedTools: string[]) => void;
  onClose: () => void;
}

/**
 * Second-level dialog for editing the agent's permission rules. Holds local state seeded from props
 * (the modal provider snapshots componentProps at open, so edits are committed on Save, not live).
 */
export function PermissionsDialog({
  effectiveTools,
  autoApprovedTools,
  disallowedTools,
  onSave,
  onClose,
}: PermissionsDialogProps) {
  const [permissions, setPermissions] = useState<ToolPermissions>(() => ({ autoApprovedTools, disallowedTools }));
  const [filter, setFilter] = useState("");
  const [customRuleInput, setCustomRuleInput] = useState("");
  const customRuleInputRef = useRef<HTMLInputElement>(null);

  const handleFilterChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setFilter(event.target.value), []);

  const handleSetToolPermission = useCallback(
    (rule: string, disposition: ToolDisposition) =>
      setPermissions((prev) => applyPermission(prev.autoApprovedTools, prev.disallowedTools, rule, disposition)),
    []
  );

  /** Canonical form of the typed custom rule, or undefined when the input is empty or unparseable. */
  const canonicalCustomRule = useMemo(() => {
    const trimmed = customRuleInput.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = parseRule(trimmed);
    return parsed ? formatRule(parsed) : undefined;
  }, [customRuleInput]);

  const showCustomRuleError = customRuleInput.trim().length > 0 && canonicalCustomRule === undefined;

  const handleAddCustom = useCallback(() => {
    if (canonicalCustomRule === undefined) {
      return;
    }

    setPermissions((prev) => addCustomPermission(prev.autoApprovedTools, prev.disallowedTools, canonicalCustomRule));
    setCustomRuleInput("");
    customRuleInputRef.current?.focus();
  }, [canonicalCustomRule]);

  const handleCustomInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setCustomRuleInput(event.target.value),
    []
  );

  const handleCustomInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleAddCustom();
      }
    },
    [handleAddCustom]
  );

  const handleSave = useCallback(() => {
    onSave(permissions.autoApprovedTools, permissions.disallowedTools);
    onClose();
  }, [permissions, onSave, onClose]);

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="p-3 space-y-3">
        <p className="text-xs text-text-muted">
          Approve a rule to skip the permission dialog, or Deny to block it. No selection means Ask each time.
          Command-scoped rules are supported, e.g. Bash(git commit *).
        </p>

        <input
          type="text"
          value={filter}
          onChange={handleFilterChange}
          placeholder="Filter rules"
          className="w-full px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-base text-xs font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />

        <div className="max-h-96 overflow-y-auto">
          <PermissionList
            effectiveTools={effectiveTools}
            autoApprovedTools={permissions.autoApprovedTools}
            disallowedTools={permissions.disallowedTools}
            filter={filter}
            onSetToolPermission={handleSetToolPermission}
          />
        </div>

        <div>
          <div className="flex gap-2">
            <input
              ref={customRuleInputRef}
              type="text"
              value={customRuleInput}
              onChange={handleCustomInputChange}
              onKeyDown={handleCustomInputKeyDown}
              placeholder="e.g. mcp__server__tool or Bash(git commit *)"
              className="flex-1 px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-base text-xs font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
            />
            <button
              type="button"
              className="px-3 py-1.5 rounded-md bg-surface-elevated text-text-neutral text-xs font-medium hover:text-text-base transition-colors disabled:opacity-50"
              onClick={handleAddCustom}
              disabled={canonicalCustomRule === undefined}
            >
              Add
            </button>
          </div>

          {showCustomRuleError && (
            <p className="text-xs text-error mt-1">Enter a valid rule, e.g. Bash(git commit *).</p>
          )}

          {canonicalCustomRule !== undefined && canonicalCustomRule !== customRuleInput.trim() && (
            <p className="text-xs text-text-muted mt-1">
              Will add: <code className="font-mono text-text-neutral">{canonicalCustomRule}</code>
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={onClose} />
        <ActionButton label="Save" variant={ACTION_BUTTON_VARIANT.PRIMARY} onClick={handleSave} />
      </div>
    </div>
  );
}
