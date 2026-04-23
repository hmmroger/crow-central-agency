import { useCallback, useMemo } from "react";
import { ChevronRight, ChevronUp, ChevronDown, Pencil, Users, Trash2 } from "lucide-react";
import type { AgentConfig, AgentCircle } from "@crow-central-agency/shared";
import { useModalDialog } from "../../../providers/modal-dialog-provider.js";
import { useDeleteCircle } from "../../../hooks/queries/use-circle-mutations.js";
import { cn } from "../../../utils/cn.js";
import { UpdateMembersDialog } from "./update-members-dialog.js";
import { useOpenCircleEditor } from "./use-open-circle-editor.js";
import { SortableAgentCard } from "../agent-card/sortable-agent-card.js";
import { useAgentDragReorder } from "../agent-card/use-agent-drag-reorder.js";

interface CircleSectionProps {
  circle: AgentCircle;
  /** Agents in this circle */
  agents: AgentConfig[];
  collapsed: boolean;
  onToggle: (circleId: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (circleId: string, direction: "up" | "down") => void;
  onReorder: (circleId: string, orderedAgentIds: string[]) => void;
}

/**
 * Collapsible dashboard section that groups agents by circle.
 * Shows circle name with member count, chevron toggle, and action buttons.
 */
export function CircleSection({
  circle,
  agents,
  collapsed,
  onToggle,
  canMoveUp,
  canMoveDown,
  onMove,
  onReorder,
}: CircleSectionProps) {
  const { showDialog } = useModalDialog();
  const openCircleEditor = useOpenCircleEditor();
  const deleteCircle = useDeleteCircle();

  const isSystemCircle = circle.isSystemCircle === true;
  const hasAgents = agents.length > 0;
  const canDelete = !isSystemCircle && !hasAgents;

  const orderedAgentIds = useMemo(() => agents.map((agent) => agent.id), [agents]);

  const handleCircleReorder = useCallback(
    (nextOrderedIds: string[]) => {
      onReorder(circle.id, nextOrderedIds);
    },
    [circle.id, onReorder]
  );

  const { draggedId, dropTargetId, handleDragStart, handleDragEnter, handleDragLeave, handleDrop, handleDragEnd } =
    useAgentDragReorder({ orderedAgentIds, onReorder: handleCircleReorder });

  const handleEdit = useCallback(() => {
    openCircleEditor(circle);
  }, [openCircleEditor, circle]);

  const handleUpdateMembers = useCallback(() => {
    showDialog({
      id: `update-members-${circle.id}`,
      component: UpdateMembersDialog,
      componentProps: { circleId: circle.id },
      title: `Update Members - ${circle.name}`,
      className: "w-fit",
      listNavigation: true,
    });
  }, [showDialog, circle.id, circle.name]);

  const handleDelete = useCallback(() => {
    if (!canDelete) {
      return;
    }

    deleteCircle.mutate(circle.id);
  }, [canDelete, deleteCircle, circle.id]);

  return (
    <section>
      <div className="flex items-center px-6 pt-5 pb-3">
        {/* Collapse toggle */}
        <button
          type="button"
          className="flex items-center gap-2 flex-1 text-left group"
          onClick={() => onToggle(circle.id)}
          aria-expanded={!collapsed}
        >
          <ChevronRight
            className={cn("h-3 w-3 text-text-muted transition-transform duration-150", !collapsed && "rotate-90")}
          />
          <h3 className="text-2xs font-medium uppercase tracking-widest text-text-muted group-hover:text-text-neutral transition-colors">
            {circle.name}
          </h3>
          <span className="text-2xs text-text-muted/60">{agents.length}</span>
        </button>

        {/* Actions — aligned right */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-1 rounded text-text-muted hover:text-primary transition-colors"
            onClick={handleEdit}
            title="Edit circle"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="p-1 rounded text-text-muted hover:text-primary transition-colors"
            onClick={handleUpdateMembers}
            title="Manage members"
          >
            <Users className="h-3.5 w-3.5" />
          </button>
          {!isSystemCircle && (
            <button
              type="button"
              className="p-1 rounded text-text-muted hover:text-error transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={handleDelete}
              disabled={!canDelete}
              title={hasAgents ? "Remove all agents before deleting" : "Delete circle"}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            className="p-1 rounded text-text-muted hover:text-text-neutral transition-colors disabled:opacity-20 disabled:cursor-default"
            onClick={() => onMove(circle.id, "up")}
            disabled={!canMoveUp}
            title="Move up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="p-1 rounded text-text-muted hover:text-text-neutral transition-colors disabled:opacity-20 disabled:cursor-default"
            onClick={() => onMove(circle.id, "down")}
            disabled={!canMoveDown}
            title="Move down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {deleteCircle.error && <p className="text-xs text-error px-6 pb-2">{deleteCircle.error.message}</p>}

      {!collapsed && (
        <div className="px-6 pb-4">
          {agents.length === 0 ? (
            <p className="text-xs text-text-muted/60 italic py-2">No agents in this circle</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
              {agents.map((agent, index) => (
                <div key={agent.id} className="animate-fade-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
                  <SortableAgentCard
                    agent={agent}
                    isBeingDragged={draggedId === agent.id}
                    isDropTarget={dropTargetId === agent.id && draggedId !== undefined && draggedId !== agent.id}
                    onDragStart={handleDragStart}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
