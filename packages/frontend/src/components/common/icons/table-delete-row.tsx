import type { IconProps } from "./icon.types.js";

/** Lucide has no delete-row glyph: a row strip with a minus beside it, drawn in lucide's style. */
export function TableDeleteRowIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
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
