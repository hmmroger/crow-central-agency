import { useCallback, useState } from "react";
import { cn } from "../../../utils/cn.js";
import { TagChip } from "./tag-chip.js";

interface ArtifactTagListProps {
  tags: string[];
  /** Max tags to show before collapsing the rest behind a "+N" toggle. Omit to show all. */
  maxVisible?: number;
  className?: string;
}

/**
 * Read-only, wrapping list of artifact tag chips. Renders nothing when there are
 * no tags; tags render in stored order. When `maxVisible` is set and exceeded, the
 * overflow collapses behind a "+N" toggle so a heavily tagged artifact stays bounded.
 */
export function ArtifactTagList({ tags, maxVisible, className }: ArtifactTagListProps) {
  const [expanded, setExpanded] = useState(false);
  const handleToggle = useCallback(() => setExpanded((current) => !current), []);

  if (tags.length === 0) {
    return undefined;
  }

  const isCollapsible = maxVisible !== undefined && tags.length > maxVisible;
  const visibleTags = isCollapsible && !expanded ? tags.slice(0, maxVisible) : tags;
  const hiddenCount = tags.length - visibleTags.length;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visibleTags.map((tag) => (
        <TagChip key={tag} label={tag} />
      ))}
      {isCollapsible && (
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={expanded}
          className="rounded-sm px-1 py-0.5 font-mono text-2xs text-text-muted hover:text-text-neutral transition-colors"
        >
          {expanded ? "Show less" : `+${hiddenCount}`}
        </button>
      )}
    </div>
  );
}
