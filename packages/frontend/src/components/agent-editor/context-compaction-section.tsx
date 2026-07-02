import { useCallback } from "react";
import {
  AGENT_TYPE,
  CLAUDE_AUTO_COMPACT_TOKENS_MAX,
  CLAUDE_AUTO_COMPACT_TOKENS_MIN,
  COPILOT_AUTO_COMPACT_UTILIZATION_MAX,
  type AgentType,
} from "@crow-central-agency/shared";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface ContextCompactionSectionProps {
  agentType: AgentType;
  enabled: boolean;
  threshold?: number;
  onEnabledChange: (enabled: boolean) => void;
  onThresholdChange: (value: number | undefined) => void;
}

/** Copilot's background compaction threshold is a 0-1 fraction of the context window. */
const UTILIZATION_STEP = 0.05;
/** Claude's auto-compact window steps in whole thousands of tokens. */
const TOKEN_STEP = 1000;

/**
 * Manual auto-compaction threshold, hidden behind a toggle. Claude Code takes a context token count;
 * GitHub Copilot takes a 0-1 utilization fraction. When off, each provider keeps its own default.
 */
export function ContextCompactionSection({
  agentType,
  enabled,
  threshold,
  onEnabledChange,
  onThresholdChange,
}: ContextCompactionSectionProps) {
  const isCopilot = agentType === AGENT_TYPE.GITHUB_COPILOT;

  const handleThresholdChange = useCallback(
    (raw: string) => {
      if (raw.trim() === "") {
        onThresholdChange(undefined);
        return;
      }

      const parsed = Number(raw);
      onThresholdChange(Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
    },
    [onThresholdChange]
  );

  return (
    <FieldGroup label="Auto Compaction">
      <Toggle
        checked={enabled}
        onChange={onEnabledChange}
        label="Enable manual compaction threshold"
        className="mb-2"
      />

      {enabled && (
        <div className="space-y-2">
          <p className="text-xs text-text-muted">
            {isCopilot
              ? "Fraction of the context window (0-1) at which background compaction starts."
              : `Context token count at which the session is automatically compacted (${CLAUDE_AUTO_COMPACT_TOKENS_MIN.toLocaleString()}-${CLAUDE_AUTO_COMPACT_TOKENS_MAX.toLocaleString()}).`}
          </p>
          <input
            type="number"
            min={isCopilot ? UTILIZATION_STEP : CLAUDE_AUTO_COMPACT_TOKENS_MIN}
            max={isCopilot ? COPILOT_AUTO_COMPACT_UTILIZATION_MAX : CLAUDE_AUTO_COMPACT_TOKENS_MAX}
            step={isCopilot ? UTILIZATION_STEP : TOKEN_STEP}
            value={threshold ?? ""}
            onChange={(event) => handleThresholdChange(event.target.value)}
            placeholder={isCopilot ? "e.g. 0.8" : "e.g. 150000"}
            className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
        </div>
      )}
    </FieldGroup>
  );
}
