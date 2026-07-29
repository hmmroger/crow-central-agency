import { useCallback, useEffect, useMemo, useState } from "react";
import { formatJSONString } from "../../../utils/format-utils";
import { EditableRuleChip } from "./editable-rule-chip.js";

interface PermissionDialogProps {
  toolName: string;
  toolUseId: string;
  input?: Record<string, unknown>;
  /** Backend-computed, diff-aware rule(s) that "Always allow" will persist. */
  autoApproveRules?: string[];
  decisionReason?: string;
  onAllow: (toolUseId: string) => void;
  onAllowAlways: (toolUseId: string, rules?: string[]) => void;
  onDeny: (toolUseId: string, message?: string) => void;
}

/**
 * Permission prompt for a tool use request.
 * Shows tool name, input preview, and actions: Allow, Allow always, Deny, or text response.
 */
export function PermissionDialog({
  toolName,
  toolUseId,
  input,
  autoApproveRules,
  decisionReason,
  onAllow,
  onAllowAlways,
  onDeny,
}: PermissionDialogProps) {
  const [responseText, setResponseText] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [editedRules, setEditedRules] = useState<string[]>(autoApproveRules ?? []);

  useEffect(() => {
    setEditedRules(autoApproveRules ?? []);
  }, [autoApproveRules]);

  const handleCommitRule = useCallback((index: number, rule: string) => {
    setEditedRules((prev) => prev.map((existing, existingIndex) => (existingIndex === index ? rule : existing)));
  }, []);

  const handleAllow = useCallback(() => {
    onAllow(toolUseId);
  }, [onAllow, toolUseId]);

  const handleAllowAlways = useCallback(() => {
    onAllowAlways(toolUseId, editedRules);
  }, [onAllowAlways, toolUseId, editedRules]);

  const handleDeny = useCallback(() => {
    onDeny(toolUseId);
  }, [onDeny, toolUseId]);

  const handleTextResponse = useCallback(() => {
    if (responseText.trim()) {
      onDeny(toolUseId, responseText.trim());
    }
  }, [onDeny, toolUseId, responseText]);

  const inputPreview = useMemo(() => {
    return input && Object.keys(input).length > 0 ? formatJSONString(input) : undefined;
  }, [input]);

  return (
    <div className="border border-warning/30 rounded-lg bg-surface-elevated p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
        <span className="text-sm font-medium text-warning">Permission Required</span>
      </div>

      {/* Tool info */}
      <div className="text-sm">
        <span className="font-mono text-text-neutral">{toolName}</span>
        {decisionReason && <p className="mt-1 text-xs text-text-muted">{decisionReason}</p>}
      </div>

      {/* Input preview */}
      {inputPreview && (
        <pre className="text-xs font-mono bg-surface-inset rounded p-2 overflow-x-auto text-text-muted max-h-32 overflow-y-auto">
          {inputPreview}
        </pre>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          className="px-3 py-1 rounded-md bg-success/20 text-success text-xs font-medium hover:bg-success/30 transition-colors"
          onClick={handleAllow}
        >
          Allow
        </button>
        <button
          type="button"
          className="px-3 py-1 rounded-md bg-success/10 text-success/70 text-xs font-medium hover:bg-success/20 transition-colors"
          onClick={handleAllowAlways}
        >
          Always allow
        </button>
        <button
          type="button"
          className="px-3 py-1 rounded-md bg-error/20 text-error text-xs font-medium hover:bg-error/30 transition-colors"
          onClick={handleDeny}
        >
          Deny
        </button>
        <button
          type="button"
          className="px-3 py-1 rounded-md bg-surface-inset text-text-muted text-xs font-medium hover:text-text-neutral transition-colors"
          onClick={() => setShowTextInput(!showTextInput)}
        >
          Respond
        </button>
      </div>

      {/* Rules that "Always allow" will persist — editable, fixed count */}
      {autoApproveRules !== undefined && autoApproveRules.length > 0 && (
        <div className="text-xs text-text-muted">
          <span>Always allow will remember:</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {editedRules.map((rule, index) => (
              <EditableRuleChip
                key={index}
                index={index}
                value={rule}
                derivedValue={autoApproveRules[index]}
                onCommit={handleCommitRule}
              />
            ))}
          </div>
        </div>
      )}

      {/* Text response input */}
      {showTextInput && (
        <div className="flex gap-2">
          <input
            type="text"
            value={responseText}
            onChange={(event) => setResponseText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleTextResponse();
              }
            }}
            placeholder="Type a response for the agent..."
            className="flex-1 px-2 py-1 rounded bg-surface-inset border border-border-subtle text-text-base text-xs placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
          <button
            type="button"
            className="px-2 py-1 rounded bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors"
            onClick={handleTextResponse}
            disabled={!responseText.trim()}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
