import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DEFAULT_AGENT_TYPE, type AgentType } from "@crow-central-agency/shared";
import { FieldGroup } from "../agent-editor/field-group.js";
import { useSetFleetConfig } from "../../hooks/queries/use-agent-builder-mutations.js";
import { useDebouncedValue } from "../../hooks/use-debounced-value.js";
import { AgentTypeSelector } from "./agent-type-selector.js";

/** Debounce window before persisting fleet-config edits. */
const FLEET_CONFIG_DEBOUNCE_MS = 400;

interface FleetConfigBarProps {
  /** Persisted project path from the draft, used to seed and guard the controlled input. */
  seedProjectPath?: string;
  /** Persisted agent type from the draft, used to seed and guard the controlled selector. */
  seedAgentType?: AgentType;
}

/** Normalize a raw path input to a trimmed value or undefined when empty. */
function normalizePath(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Fleet-level config row (project path + agent type); the view owns its placement. Controlled inputs
 * are seeded from the draft and persisted via a debounced PATCH. The "differs from seed" guard skips
 * the redundant PATCH of seeded values and prevents a re-PATCH loop after the draft invalidates.
 */
export function FleetConfigBar({ seedProjectPath, seedAgentType }: FleetConfigBarProps) {
  const [projectPath, setProjectPath] = useState(seedProjectPath ?? "");
  const [agentType, setAgentType] = useState<AgentType | undefined>(seedAgentType);
  const pathFocusedRef = useRef(false);
  const seedNormPathRef = useRef(normalizePath(seedProjectPath ?? ""));
  const seedTypeRef = useRef(seedAgentType);
  const { mutate: setFleetConfig } = useSetFleetConfig();

  // Re-sync local inputs when the persisted draft changes. While the path input is focused the local
  // value is authoritative — re-seeding it mid-edit would clobber in-progress keystrokes. The agent type
  // is a discrete pick, so it never is. The seed refs feed the persist guard without making the persist
  // effect depend on server changes.
  useEffect(() => {
    seedNormPathRef.current = normalizePath(seedProjectPath ?? "");
    seedTypeRef.current = seedAgentType;
    if (!pathFocusedRef.current) {
      setProjectPath(seedProjectPath ?? "");
    }

    setAgentType(seedAgentType);
  }, [seedProjectPath, seedAgentType]);

  const localConfig = useMemo(() => ({ projectPath, agentType }), [projectPath, agentType]);
  const debouncedConfig = useDebouncedValue(localConfig, FLEET_CONFIG_DEBOUNCE_MS);

  // Persist only on a user edit (the debounced value settling to something other than the seed). The
  // seed comparison reads refs, not deps, so a server-driven seed update never re-triggers this effect
  // with a stale debounced value — which would otherwise clear the saved config.
  useEffect(() => {
    const normalizedPath = normalizePath(debouncedConfig.projectPath);
    if (normalizedPath === seedNormPathRef.current && debouncedConfig.agentType === seedTypeRef.current) {
      return;
    }

    setFleetConfig({ projectPath: normalizedPath, agentType: debouncedConfig.agentType });
  }, [debouncedConfig, setFleetConfig]);

  const handleProjectPathChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setProjectPath(event.target.value);
  }, []);

  const handleProjectPathFocus = useCallback(() => {
    pathFocusedRef.current = true;
  }, []);

  const handleProjectPathBlur = useCallback(() => {
    pathFocusedRef.current = false;
  }, []);

  const handleAgentTypeChange = useCallback((value: AgentType) => {
    setAgentType(value);
  }, []);

  return (
    <div className="flex w-full flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <FieldGroup label="Project Path">
          <input
            type="text"
            value={projectPath}
            onChange={handleProjectPathChange}
            onFocus={handleProjectPathFocus}
            onBlur={handleProjectPathBlur}
            placeholder="/path/to/project (optional)"
            className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
        </FieldGroup>
      </div>

      <div className="w-full sm:w-64">
        <FieldGroup label="Agent Type">
          <AgentTypeSelector
            value={agentType ?? DEFAULT_AGENT_TYPE}
            onChange={handleAgentTypeChange}
            menuId="agent-builder-agent-type"
          />
        </FieldGroup>
      </div>
    </div>
  );
}
