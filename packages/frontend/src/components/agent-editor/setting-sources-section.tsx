import { SETTING_SOURCE, type SettingSource } from "@crow-central-agency/shared";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface SettingSourcesSectionProps {
  settingSources: SettingSource[];
  onSettingSourcesChange: (updater: (prev: SettingSource[]) => SettingSource[]) => void;
}

const SETTING_SOURCE_OPTIONS = [SETTING_SOURCE.USER, SETTING_SOURCE.PROJECT, SETTING_SOURCE.LOCAL] as const;

export function SettingSourcesSection({ settingSources, onSettingSourcesChange }: SettingSourcesSectionProps) {
  const setSourceEnabled = (source: SettingSource, enabled: boolean) => {
    onSettingSourcesChange((prev) => {
      if (enabled) {
        return prev.includes(source) ? prev : [...prev, source];
      }

      return prev.filter((existing) => existing !== source);
    });
  };

  return (
    <FieldGroup label="Setting Sources">
      <p className="mb-1.5 text-xs text-text-muted">SDK configuration sources included in queries.</p>
      <div className="flex flex-wrap gap-4">
        {SETTING_SOURCE_OPTIONS.map((source) => (
          <Toggle
            key={source}
            checked={settingSources.includes(source)}
            onChange={(enabled) => setSourceEnabled(source, enabled)}
            label={source.charAt(0).toUpperCase() + source.slice(1)}
            variant="secondary"
          />
        ))}
      </div>
    </FieldGroup>
  );
}
