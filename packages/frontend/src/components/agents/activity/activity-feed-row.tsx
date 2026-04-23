import { useState } from "react";
import { ChevronRight, CornerDownRight } from "lucide-react";
import { AGENT_ACTIVITY_TYPE, type AgentActivity } from "@crow-central-agency/shared";
import { cn } from "../../../utils/cn.js";
import { formatJSONString, formatRelativeTime } from "../../../utils/format-utils.js";
import { getActivitySummary, hasActivityDetails } from "./agent-activity-display.js";

interface ActivityFeedRowProps {
  activity: AgentActivity;
}

interface ActivityDetailsProps {
  activity: AgentActivity;
}

interface DetailFieldProps {
  label: string;
  value: string;
  mono?: boolean;
}

export function ActivityFeedRow({ activity }: ActivityFeedRowProps) {
  const [expanded, setExpanded] = useState(false);
  const expandable = hasActivityDetails(activity);
  const summary = getActivitySummary(activity);
  const isSubAgent = activity.type !== AGENT_ACTIVITY_TYPE.QUERYSTART && activity.subAgentId !== undefined;

  const summaryRow = (
    <div className="flex items-start gap-1.5 w-full text-left">
      {expandable ? (
        <ChevronRight
          className={cn(
            "h-3 w-3 mt-0.5 shrink-0 text-accent transition-transform duration-150",
            expanded && "rotate-90"
          )}
        />
      ) : (
        <span className="h-3 w-3 mt-0.5 shrink-0 flex items-center justify-center" aria-hidden>
          <span className="h-1 w-1 rounded-full bg-accent" />
        </span>
      )}
      {isSubAgent && (
        <CornerDownRight className="h-3 w-3 mt-0.5 shrink-0 text-secondary" aria-label="Subagent activity" />
      )}
      <span
        className={`flex-1 min-w-0 font-mono text-2xs leading-snug wrap-break-word ${activity.type === AGENT_ACTIVITY_TYPE.QUERYSTART ? "text-primary/75" : "text-text-neutral"}`}
      >
        {summary}
      </span>
      <span className="shrink-0 font-mono text-3xs text-text-muted mt-0.5">
        {formatRelativeTime(activity.timestamp)}
      </span>
    </div>
  );

  return (
    <div className="py-1">
      {expandable ? (
        <button
          type="button"
          className="w-full hover:text-text-base transition-colors"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${summary}` : `Expand ${summary}`}
        >
          {summaryRow}
        </button>
      ) : (
        summaryRow
      )}

      {expandable && expanded && <ActivityDetails activity={activity} />}
    </div>
  );
}

function ActivityDetails({ activity }: ActivityDetailsProps) {
  if (activity.type === AGENT_ACTIVITY_TYPE.QUERYSTART) {
    return undefined;
  }

  const isToolUse = activity.type === AGENT_ACTIVITY_TYPE.TOOLUSE;
  const serializedInput = isToolUse && activity.input !== undefined ? formatJSONString(activity.input) : undefined;

  return (
    <div className="ml-6 mt-1 pl-2.5 border-l-2 border-border-subtle/40 space-y-1.5">
      {isToolUse ? (
        <DetailField label="Tool" value={activity.toolName} />
      ) : (
        <DetailField label="Event" value={activity.activity} />
      )}

      <DetailField label="Description" value={activity.description} />

      {activity.subAgentId !== undefined && <DetailField label="Subagent" value={activity.subAgentId} mono />}

      {serializedInput !== undefined && (
        <div>
          <div className="text-3xs font-mono uppercase tracking-[0.15em] text-text-muted">Input</div>
          <pre className="mt-1 max-h-40 overflow-auto rounded-sm bg-surface-inset border border-border-subtle/30 p-1.5 text-3xs text-text-neutral font-mono whitespace-pre-wrap wrap-break-word">
            {serializedInput}
          </pre>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value, mono }: DetailFieldProps) {
  return (
    <div>
      <span className="text-3xs font-mono uppercase tracking-[0.15em] text-text-muted">{label}</span>
      <div className={cn("mt-0.5 text-2xs text-text-neutral wrap-break-word", mono && "font-mono")}>{value}</div>
    </div>
  );
}
