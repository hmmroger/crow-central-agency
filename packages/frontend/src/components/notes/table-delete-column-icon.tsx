import type { TableIconProps } from "./table-icons.types.js";

/** Lucide has no delete-column glyph: a column strip with a minus below it, drawn in lucide's style. */
export function TableDeleteColumnIcon({ className }: TableIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="5" y="3" width="14" height="12" rx="2" />
      <path d="M12 3v12" />
      <path d="M9.5 20h5" />
    </svg>
  );
}
