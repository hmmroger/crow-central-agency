import type { SessionUsage } from "@crow-central-agency/shared";

interface AgentCardUsageProps {
  usage: SessionUsage;
}

/**
 * Compact usage badge showing cost, tokens, and context usage.
 */
export function AgentCardUsage({ usage }: AgentCardUsageProps) {
  if (usage.totalCostUsd === 0 && usage.inputTokens === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-text-muted">
      {usage.totalCostUsd > 0 && <span>${usage.totalCostUsd.toFixed(4)}</span>}

      {usage.inputTokens > 0 && <span>{formatTokens(usage.inputTokens + usage.outputTokens)} tokens</span>}

      {usage.contextTotal > 0 && (
        <span>
          {Math.round(usage.contextUsed / 1000)}k / {Math.round(usage.contextTotal / 1000)}k ctx
        </span>
      )}
    </div>
  );
}

/** Format token count with K suffix for readability */
function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }

  return String(count);
}
