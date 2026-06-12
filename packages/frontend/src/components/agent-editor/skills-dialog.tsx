import { useCallback, useMemo, useState } from "react";
import type { DiscoveredSkill } from "@crow-central-agency/shared";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";

interface SkillsDialogProps {
  discoveredSkills: DiscoveredSkill[];
  disabledSkills: string[];
  onSave: (disabledSkills: string[]) => void;
  onClose: () => void;
}

export function SkillsDialog({ discoveredSkills, disabledSkills, onSave, onClose }: SkillsDialogProps) {
  const [disabledSet, setDisabledSet] = useState<Set<string>>(() => new Set(disabledSkills));

  const handleToggle = useCallback((skillName: string) => {
    setDisabledSet((prev) => {
      const next = new Set(prev);
      if (next.has(skillName)) {
        next.delete(skillName);
      } else {
        next.add(skillName);
      }

      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setDisabledSet(new Set(discoveredSkills.map((skill) => skill.name)));
  }, [discoveredSkills]);

  const handleClearAll = useCallback(() => {
    setDisabledSet(new Set());
  }, []);

  const handleSave = useCallback(() => {
    const ordered = discoveredSkills.map((skill) => skill.name).filter((skillName) => disabledSet.has(skillName));
    onSave(ordered);
    onClose();
  }, [discoveredSkills, disabledSet, onSave, onClose]);

  const disabledCount = useMemo(
    () => discoveredSkills.reduce((count, skill) => (disabledSet.has(skill.name) ? count + 1 : count), 0),
    [discoveredSkills, disabledSet]
  );

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="p-3 space-y-3">
        <p className="text-xs text-text-muted">
          Check the skills the agent should <strong className="font-semibold text-text-neutral">ignore</strong>.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">
            {disabledCount} of {discoveredSkills.length} disabled
          </span>
          <div className="flex gap-2">
            <ActionButton label="Select all" onClick={handleSelectAll} />
            <ActionButton label="Clear" onClick={handleClearAll} disabled={disabledCount === 0} />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto rounded border border-border-subtle/40 bg-surface-inset/40 p-2">
          {discoveredSkills.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-3">No skills discovered yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {discoveredSkills.map((skill) => (
                <label
                  key={`${skill.source}::${skill.name}`}
                  className="flex items-center gap-2 min-w-0 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={disabledSet.has(skill.name)}
                    onChange={() => handleToggle(skill.name)}
                    className="rounded border-border-subtle bg-surface-inset text-primary focus:ring-primary/30 shrink-0"
                  />
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-xs text-text-neutral truncate" title={skill.name}>
                      {skill.name}
                    </span>
                    <span className="text-2xs text-text-muted truncate" title={skill.source}>
                      {skill.source}
                    </span>
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
