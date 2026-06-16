import { cn } from "../../../utils/cn.js";
import { TagChip } from "./tag-chip.js";

interface ArtifactTagListProps {
  tags: string[];
  className?: string;
}

/**
 * Read-only, wrapping list of artifact tag chips.
 * Renders nothing when there are no tags. Tags are render in stored order.
 */
export function ArtifactTagList({ tags, className }: ArtifactTagListProps) {
  if (tags.length === 0) {
    return undefined;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tags.map((tag) => (
        <TagChip key={tag} label={tag} />
      ))}
    </div>
  );
}
