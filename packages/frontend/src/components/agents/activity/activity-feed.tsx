import { useMemo } from "react";
import { useAgentActivitiesQuery } from "../../../hooks/queries/use-agent-activities-query.js";
import { cn } from "../../../utils/cn.js";
import { ActivityFeedRow } from "./activity-feed-row.js";

interface ActivityFeedProps {
  agentId: string;
}

interface FeedMessageProps {
  text: string;
  tone?: "muted" | "error";
}

/**
 * Scrollable, reverse-chronological list of persisted agent activities.
 */
export function ActivityFeed({ agentId }: ActivityFeedProps) {
  const { data: activities, isLoading, isError } = useAgentActivitiesQuery(agentId);
  const activityFeedItems = useMemo(() => {
    if (!activities) {
      return null;
    }

    const reversed = [...activities].reverse();
    return reversed.map((activity) => <ActivityFeedRow key={activity.id} activity={activity} />);
  }, [activities]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <span className="text-2xs font-mono uppercase tracking-[0.15em] text-text-muted">Activity</span>
      <div className="mt-1.5 flex-1 min-h-0 overflow-y-auto rounded-md bg-surface-inset border border-border-subtle/30 px-2 py-1.5">
        {isLoading && <FeedMessage text="Loading activity" />}
        {isError && <FeedMessage text="Failed to load activity" tone="error" />}
        {!activities?.length && <FeedMessage text="No activity yet" />}
        {activityFeedItems && <div className="flex flex-col">{activityFeedItems}</div>}
      </div>
    </div>
  );
}

function FeedMessage({ text, tone = "muted" }: FeedMessageProps) {
  const colorClass = tone === "error" ? "text-error" : "text-text-muted";
  return (
    <div
      className={cn("flex items-center justify-center py-3 text-3xs font-mono uppercase tracking-[0.15em]", colorClass)}
    >
      {text}
    </div>
  );
}
