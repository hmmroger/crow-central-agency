import type { TableIconProps } from "./table-icons.types.js";

/** Lucide has no delete-row glyph: a row strip with a minus beside it, drawn in lucide's style. */
export function TableDeleteRowIcon({ className }: TableIconProps) {
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
      <rect x="3" y="5" width="12" height="14" rx="2" />
      <path d="M3 12h12" />
      <path d="M17 12h5" />
    </svg>
  );
}
