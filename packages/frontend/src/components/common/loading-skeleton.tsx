/** Predetermined widths for skeleton lines to avoid Math.random in render */
const LINE_WIDTHS = ["85%", "70%", "92%", "78%", "88%", "65%"];

/**
 * Skeleton placeholder - animated pulse block for loading states.
 */
export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 p-4 animate-pulse">
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="h-3 rounded bg-surface-elevated"
          style={{ width: LINE_WIDTHS[index % LINE_WIDTHS.length] }}
        />
      ))}
    </div>
  );
}
