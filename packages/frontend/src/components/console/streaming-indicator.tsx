/**
 * Animated indicator shown while an agent is streaming a response.
 */
export function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted">
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0ms" }} />
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: "150ms" }} />
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: "300ms" }} />
      </span>
      <span>Thinking...</span>
    </div>
  );
}
