interface ActivityItemProps {
  toolName: string;
  content: string;
}

/**
 * Displays a tool activity event (e.g., "Reading src/app.ts").
 * Subagent status is derived from toolName rather than passed as a prop.
 */
export function ActivityItem({ toolName, content }: ActivityItemProps) {
  const isSubagent = toolName === "Agent";

  return (
    <div className="flex items-center gap-2 px-3 py-1 text-xs text-text-muted">
      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-secondary" />
      <span className="font-mono text-text-muted">{toolName}</span>
      <span className="truncate">{content}</span>
      {isSubagent && <span className="text-accent text-2xs">subagent</span>}
    </div>
  );
}
