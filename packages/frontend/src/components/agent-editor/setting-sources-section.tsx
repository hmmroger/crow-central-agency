import { useCallback } from "react";
import { AGENT_TYPE, SETTING_SOURCE, type AgentType, type SettingSource } from "@crow-central-agency/shared";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface SettingSourcesSectionProps {
  settingSources: SettingSource[];
  agentType: AgentType;
  onSettingSourcesChange: (updater: (prev: SettingSource[]) => SettingSource[]) => void;
}

const SETTING_SOURCE_OPTIONS = [SETTING_SOURCE.USER, SETTING_SOURCE.PROJECT, SETTING_SOURCE.LOCAL] as const;

export function SettingSourcesSection({
  settingSources,
  agentType,
  onSettingSourcesChange,
}: SettingSourcesSectionProps) {
  const isCopilot = agentType === AGENT_TYPE.GITHUB_COPILOT;

  const setSourceEnabled = useCallback(
    (source: SettingSource, enabled: boolean) => {
      onSettingSourcesChange((prev) => {
        if (enabled) {
          return prev.includes(source) ? prev : [...prev, source];
        }

        return prev.filter((existing) => existing !== source);
      });
    },
    [onSettingSourcesChange]
  );

  return (
    <FieldGroup label="Setting Sources">
      <p className="mb-1.5 text-xs text-text-muted">
        {isCopilot
          ? 'Copilot only supports the "Project" source, which enables project-local config discovery.'
          : "SDK configuration sources included in queries."}
      </p>
      <div className="flex flex-wrap gap-4">
        {SETTING_SOURCE_OPTIONS.map((source) => (
          <Toggle
            key={source}
            checked={settingSources.includes(source)}
            onChange={(enabled) => setSourceEnabled(source, enabled)}
            label={source.charAt(0).toUpperCase() + source.slice(1)}
            variant="secondary"
            disabled={isCopilot && source !== SETTING_SOURCE.PROJECT}
          />
        ))}
      </div>
    </FieldGroup>
  );
}
