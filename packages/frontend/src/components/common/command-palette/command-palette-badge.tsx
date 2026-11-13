interface CommandPaletteBadgeProps {
  label: string;
}

/** Small trailing tag on a palette row */
export function CommandPaletteBadge({ label }: CommandPaletteBadgeProps) {
  return (
    <span className="shrink-0 px-1.5 py-0.5 rounded-xs border border-border-subtle text-3xs uppercase tracking-wider text-secondary bg-surface-inset">
      {label}
    </span>
  );
}
