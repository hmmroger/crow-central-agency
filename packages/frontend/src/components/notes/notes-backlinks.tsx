import { ChevronRight } from "lucide-react";
import { useAppStore } from "../../stores/app-store.js";
import { cn } from "../../utils/cn.js";
import { Tree } from "../common/tree/tree.js";
import { NotesTreeStatus } from "./notes-tree-status.js";
import { useBacklinkTreeNodes } from "./use-backlink-tree-nodes.js";

interface NotesBacklinksProps {
  /** The open live note or folder */
  targetId: string;
}

/** Collapsible list of the live notes that link to the open entry; selecting one opens it. */
export function NotesBacklinks({ targetId }: NotesBacklinksProps) {
  const { nodes, isLoading, error } = useBacklinkTreeNodes(targetId);
  const isCollapsed = useAppStore((state) => state.isNotesBacklinksCollapsed);
  const toggleCollapsed = useAppStore((state) => state.toggleNotesBacklinksCollapsed);
  const selectNote = useAppStore((state) => state.selectNote);

  return (
    <section className="flex max-h-2/5 shrink-0 flex-col gap-1 border-t border-border-subtle pt-1">
      <button
        type="button"
        className="group flex shrink-0 items-center gap-2 px-2 py-1 text-left"
        onClick={toggleCollapsed}
        aria-expanded={!isCollapsed}
      >
        <ChevronRight
          className={cn("h-3 w-3 text-text-muted transition-transform duration-150", !isCollapsed && "rotate-90")}
        />
        <span className="text-2xs font-medium uppercase tracking-widest text-text-muted transition-colors group-hover:text-text-neutral">
          Backlinks
        </span>
        <span className="text-2xs text-text-muted">{nodes.length}</span>
      </button>

      {!isCollapsed && (
        <NotesTreeStatus
          isLoading={isLoading}
          error={error}
          isEmpty={nodes.length === 0}
          emptyMessage="No notes link here."
        >
          <Tree nodes={nodes} onSelect={selectNote} ariaLabel="Backlinks" />
        </NotesTreeStatus>
      )}
    </section>
  );
}
