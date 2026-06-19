interface CommandItemProps {
  content: string;
}

/** Displays a slash-command system event (e.g. "/compact") as a centered pill. */
export function CommandItem({ content }: CommandItemProps) {
  return (
    <div className="flex justify-center px-3 py-1">
      <span className="rounded-full bg-surface-elevated/30 px-2 py-0.5 font-mono text-3xs text-text-muted italic">
        {content}
      </span>
    </div>
  );
}
