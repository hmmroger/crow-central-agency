/**
 * Animated indicator shown while an agent is streaming a response.
 * Centered within the message list's max-width container.
 */
export function StreamingIndicator() {
  return (
    <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-text-muted">
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse [animation-delay:0ms]" />
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse [animation-delay:150ms]" />
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
      </span>
      <span>Thinking...</span>
    </div>
  );
}
