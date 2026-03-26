import { SETTING_SOURCE, type SettingSource } from "@crow-central-agency/shared";
import { FieldGroup } from "./field-group.js";

interface SettingSourcesSectionProps {
  settingSources: SettingSource[];
  onSettingSourcesChange: (updater: (prev: SettingSource[]) => SettingSource[]) => void;
}

/** Setting sources checkboxes */
export function SettingSourcesSection({ settingSources, onSettingSourcesChange }: SettingSourcesSectionProps) {
  const toggleSource = (source: SettingSource) => {
    onSettingSourcesChange((prev) =>
      prev.includes(source) ? prev.filter((existing) => existing !== source) : [...prev, source]
    );
  };

  return (
    <FieldGroup label="Setting Sources">
      <p className="text-xs text-text-muted mb-2">SDK configuration sources included in queries.</p>
      <div className="flex gap-3">
        {([SETTING_SOURCE.USER, SETTING_SOURCE.PROJECT, SETTING_SOURCE.LOCAL] as const).map((source) => (
          <label key={source} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={settingSources.includes(source)}
              onChange={() => toggleSource(source)}
              className="rounded border-border-subtle bg-surface-inset text-primary focus:ring-primary/30"
            />
            <span className="text-xs text-text-secondary capitalize">{source}</span>
          </label>
        ))}
      </div>
    </FieldGroup>
  );
}
