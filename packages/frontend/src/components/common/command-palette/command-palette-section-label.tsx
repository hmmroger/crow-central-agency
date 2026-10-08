interface CommandPaletteSectionLabelProps {
  label: string;
}

export function CommandPaletteSectionLabel({ label }: CommandPaletteSectionLabelProps) {
  return (
    <span className="text-3xs uppercase tracking-wider text-text-muted" aria-hidden="true">
      {label}
    </span>
  );
}
