import { useCallback, useMemo, useState } from "react";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";

interface InstructionSourcesDialogProps {
  instructionSources: string[];
  disabledInstructionSources: string[];
  onSave: (disabledInstructionSources: string[]) => void;
  onClose: () => void;
}

export function InstructionSourcesDialog({
  instructionSources,
  disabledInstructionSources,
  onSave,
  onClose,
}: InstructionSourcesDialogProps) {
  const [disabledSet, setDisabledSet] = useState<Set<string>>(() => new Set(disabledInstructionSources));

  const handleToggle = useCallback((sourceId: string) => {
    setDisabledSet((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }

      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setDisabledSet(new Set(instructionSources));
  }, [instructionSources]);

  const handleClearAll = useCallback(() => {
    setDisabledSet(new Set());
  }, []);

  const handleSave = useCallback(() => {
    onSave(instructionSources.filter((sourceId) => disabledSet.has(sourceId)));
    onClose();
  }, [instructionSources, disabledSet, onSave, onClose]);

  const disabledCount = useMemo(
    () => instructionSources.reduce((count, sourceId) => (disabledSet.has(sourceId) ? count + 1 : count), 0),
    [instructionSources, disabledSet]
  );

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="p-3 space-y-3">
        <p className="text-xs text-text-muted">
          Check the instruction sources the agent should{" "}
          <strong className="font-semibold text-text-neutral">ignore</strong>.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">
            {disabledCount} of {instructionSources.length} disabled
          </span>
          <div className="flex gap-2">
            <ActionButton label="Select all" onClick={handleSelectAll} />
            <ActionButton label="Clear" onClick={handleClearAll} disabled={disabledCount === 0} />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto rounded border border-border-subtle/40 bg-surface-inset/40 p-2">
          {instructionSources.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-3">No instruction sources discovered yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {instructionSources.map((sourceId) => (
                <label key={sourceId} className="flex items-center gap-2 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disabledSet.has(sourceId)}
                    onChange={() => handleToggle(sourceId)}
                    className="rounded border-border-subtle bg-surface-inset text-primary focus:ring-primary/30 shrink-0"
                  />
                  <span className="text-xs text-text-neutral truncate" title={sourceId}>
                    {sourceId}
                  </span>
                </label>
              ))}
            </div>
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
