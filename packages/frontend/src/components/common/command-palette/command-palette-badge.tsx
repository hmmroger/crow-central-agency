interface CommandPaletteBadgeProps {
  label: string;
}

/** Small trailing tag on a palette row */
export function CommandPaletteBadge({ label }: CommandPaletteBadgeProps) {
  return (
    <span className="shrink-0 px-1.5 py-0.5 rounded-xs bg-surface-inset text-3xs uppercase tracking-wider text-text-muted">
      {label}
    </span>
  );
}
