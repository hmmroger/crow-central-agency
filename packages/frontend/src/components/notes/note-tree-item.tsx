import { useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileQuestion,
  FileText,
  Folder,
  FolderOpen,
  Image,
  type LucideIcon,
} from "lucide-react";
import { ENTITY_TYPE, NOTE_CONTENT_TYPE, type NoteContentType, type NoteMetadata } from "@crow-central-agency/shared";
import type { NoteTreeEntry } from "../../utils/note-tree.js";
import { cn } from "../../utils/cn.js";
import { NoteTreeActionButton } from "./note-tree-action-button.js";
import type { NoteTreeAction } from "./note-tree.types.js";

interface NoteTreeItemProps {
  entry: NoteTreeEntry;
  expandedIds: ReadonlySet<string>;
  selectedId?: string;
  /** Row-level controls, rendered for the notes each one applies to */
  actions?: readonly NoteTreeAction[];
  onToggle: (noteId: string) => void;
  onSelect: (metadata: NoteMetadata) => void;
}

/** Row icon for a note, by content type */
const NOTE_CONTENT_ICON: Record<NoteContentType, LucideIcon> = {
  [NOTE_CONTENT_TYPE.TEXT]: FileText,
  [NOTE_CONTENT_TYPE.IMAGE]: Image,
  [NOTE_CONTENT_TYPE.UNKNOWN]: FileQuestion,
};

/**
 * A single row of the note tree, rendering its children as a nested list
 * while the folder is expanded.
 */
export function NoteTreeItem({ entry, expandedIds, selectedId, actions, onToggle, onSelect }: NoteTreeItemProps) {
  const { metadata, children } = entry;
  const isFolder = metadata.entityType === ENTITY_TYPE.NOTE_FOLDER;
  const isExpanded = expandedIds.has(metadata.id);
  const isSelected = metadata.id === selectedId;
  const FolderIcon = isExpanded ? FolderOpen : Folder;
  const NoteIcon =
    metadata.entityType === ENTITY_TYPE.NOTE_FOLDER ? FolderIcon : NOTE_CONTENT_ICON[metadata.contentType];
  const Chevron = isExpanded ? ChevronDown : ChevronRight;
  const availableActions = actions?.filter((action) => action.isAvailable?.(metadata) ?? true) ?? [];
  const rowRef = useRef<HTMLDivElement>(null);

  // The row only mounts once its folders are expanded, so a selection restored
  // into a collapsed branch scrolls as soon as the reveal unfolds it.
  useEffect(() => {
    if (isSelected) {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  const handleClick = () => {
    if (isFolder) {
      onToggle(metadata.id);
    }

    onSelect(metadata);
  };

  return (
    <li>
      <div
        ref={rowRef}
        className={cn(
          "group flex items-center rounded-sm pr-1 transition-colors",
          isSelected ? "bg-surface-accent" : "hover:bg-surface-hover"
        )}
      >
        <button
          type="button"
          aria-expanded={isFolder ? isExpanded : undefined}
          aria-current={isSelected}
          className={cn(
            "flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 text-sm text-left",
            isSelected ? "text-text-base" : "text-text-neutral"
          )}
          onClick={handleClick}
        >
          {isFolder ? (
            <Chevron className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <NoteIcon className={cn("h-3.5 w-3.5 shrink-0", isFolder ? "text-accent" : "text-text-muted")} />
          <span className="truncate">{metadata.name}</span>
        </button>

        {availableActions.map((action) => (
          <NoteTreeActionButton key={action.id} action={action} metadata={metadata} />
        ))}
      </div>

      {isFolder && isExpanded && children.length > 0 && (
        <ul className="pl-3">
          {children.map((child) => (
            <NoteTreeItem
              key={child.metadata.id}
              entry={child}
              expandedIds={expandedIds}
              selectedId={selectedId}
              actions={actions}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
