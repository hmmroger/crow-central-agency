interface ResultBannerProps {
  subtype: string;
  costUsd?: number;
  durationMs?: number;
}

/**
 * Displays the result of a completed agent query - success or error with cost/duration.
 */
export function ResultBanner({ subtype, costUsd, durationMs }: ResultBannerProps) {
  const isSuccess = subtype === "success";
  const bgClass = isSuccess ? "bg-success/10 border-success/20" : "bg-error/10 border-error/20";
  const textClass = isSuccess ? "text-success" : "text-error";

  return (
    <div
      className={`flex items-center gap-3 px-3 py-1.5 rounded text-xs border ${bgClass} animate-[fade-slide-up_var(--duration-normal)_var(--ease-out)_both]`}
    >
      <span className={textClass}>{isSuccess ? "Completed" : subtype}</span>

      {costUsd !== undefined && <span className="text-text-muted">${costUsd.toFixed(4)}</span>}

      {durationMs !== undefined && <span className="text-text-muted">{(durationMs / 1000).toFixed(1)}s</span>}
    </div>
  );
}
