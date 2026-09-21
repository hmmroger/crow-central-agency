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
import type { NoteTreeNode } from "../../utils/note-tree.js";
import { cn } from "../../utils/cn.js";

interface NoteTreeItemProps {
  node: NoteTreeNode;
  expandedIds: ReadonlySet<string>;
  selectedId?: string;
  onToggle: (nodeId: string) => void;
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
export function NoteTreeItem({ node, expandedIds, selectedId, onToggle, onSelect }: NoteTreeItemProps) {
  const { metadata, children } = node;
  const isFolder = metadata.entityType === ENTITY_TYPE.NOTE_FOLDER;
  const isExpanded = expandedIds.has(metadata.id);
  const isSelected = metadata.id === selectedId;
  const FolderIcon = isExpanded ? FolderOpen : Folder;
  const NodeIcon =
    metadata.entityType === ENTITY_TYPE.NOTE_FOLDER ? FolderIcon : NOTE_CONTENT_ICON[metadata.contentType];
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  const handleClick = () => {
    if (isFolder) {
      onToggle(metadata.id);
    }

    onSelect(metadata);
  };

  return (
    <li>
      <button
        type="button"
        aria-expanded={isFolder ? isExpanded : undefined}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 rounded-sm text-sm text-left transition-colors",
          isSelected ? "bg-surface-hover text-text-base" : "text-text-neutral hover:bg-surface-hover"
        )}
        onClick={handleClick}
      >
        {isFolder ? <Chevron className="h-3.5 w-3.5 shrink-0 text-text-muted" /> : <span className="w-3.5 shrink-0" />}
        <NodeIcon className={cn("h-3.5 w-3.5 shrink-0", isFolder ? "text-accent" : "text-text-muted")} />
        <span className="truncate">{metadata.name}</span>
      </button>

      {isFolder && isExpanded && children.length > 0 && (
        <ul className="pl-3">
          {children.map((child) => (
            <NoteTreeItem
              key={child.metadata.id}
              node={child}
              expandedIds={expandedIds}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
