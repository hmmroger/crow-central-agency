interface ActivityItemProps {
  toolName: string;
  description: string;
  isSubagent?: boolean;
}

/**
 * Displays a tool activity event (e.g., "Reading src/app.ts").
 */
export function ActivityItem({ toolName, description, isSubagent }: ActivityItemProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1 text-xs text-text-muted">
      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-secondary" />
      <span className="font-mono text-text-muted">{toolName}</span>
      <span className="truncate">{description}</span>
      {isSubagent && <span className="text-accent text-[0.65rem]">subagent</span>}
    </div>
  );
}
