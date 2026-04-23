interface CrowIconProps {
  className?: string;
  size?: number;
}

/** Crow mark — uses currentColor so it inherits from the parent's text color. */
export function CrowIcon({ className, size = 48 }: CrowIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12.7 12.7" xmlns="http://www.w3.org/2000/svg" className={className}>
      <text
        x="2.0505209"
        y="9.7537537"
        fontFamily="'Noto Sans JP', sans-serif"
        fontSize="9.17222"
        fontWeight={600}
        fill="currentColor"
      >
        カ
      </text>
      <circle cx="6.3610144" cy="6.3610144" r="5.8562732" fill="none" stroke="currentColor" strokeWidth={0.801} />
    </svg>
  );
}
