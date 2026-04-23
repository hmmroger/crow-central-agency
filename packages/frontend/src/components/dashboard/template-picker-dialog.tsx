import { useCallback } from "react";
import { useListItem } from "@floating-ui/react";
import { Bookmark, Trash2 } from "lucide-react";
import type { AgentConfigTemplate } from "@crow-central-agency/shared";
import { useAgentTemplatesQuery } from "../../hooks/queries/use-agent-templates-query.js";
import { useDeleteAgentTemplate } from "../../hooks/queries/use-agent-mutations.js";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { useModalDialogListNav } from "../../providers/modal-dialog-list-nav-provider.js";
import { ActionButton } from "../common/action-button.js";
import { cn } from "../../utils/cn.js";

interface TemplateItemProps {
  template: AgentConfigTemplate;
  onSelect: (template: AgentConfigTemplate) => void;
  onDelete: (template: AgentConfigTemplate) => void;
}

interface TemplatePickerDialogProps {
  /** Called with the chosen template when the user selects a row */
  onSelect: (template: AgentConfigTemplate) => void;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/**
 * Modal content for choosing a saved agent template.
 * Clicking a row selects the template and closes the dialog — the caller
 * is responsible for opening the agent editor with the returned preset.
 */
export function TemplatePickerDialog({ onSelect, onClose }: TemplatePickerDialogProps) {
  const { data: templates, isLoading, error } = useAgentTemplatesQuery();
  const deleteTemplate = useDeleteAgentTemplate();
  const confirm = useConfirmDialog();

  const handleSelect = useCallback(
    (template: AgentConfigTemplate) => {
      onSelect(template);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleDelete = useCallback(
    (template: AgentConfigTemplate) => {
      confirm({
        title: "Delete Template",
        message: `Delete template "${template.templateName}"? This cannot be undone.`,
        confirmLabel: "Delete",
        destructive: true,
        onConfirm: async () => {
          await deleteTemplate.mutateAsync(template.templateId);
        },
      });
    },
    [confirm, deleteTemplate]
  );

  return (
    <div className="flex flex-col">
      <div className="p-3 space-y-3 w-md">
        <p className="text-xs text-text-muted">Start a new agent pre-filled from a saved template.</p>

        <div className="flex flex-col gap-1 max-h-80 overflow-y-auto p-1">
          {isLoading && <p className="text-sm text-text-muted px-3 py-2">Loading templates...</p>}
          {error && <p className="text-sm text-error px-3 py-2">Failed to load templates: {error.message}</p>}
          {!isLoading && !error && templates?.length === 0 && (
            <p className="text-sm text-text-muted px-3 py-2">
              No templates yet. Save an agent as a template from its editor to get started.
            </p>
          )}
          {templates?.map((template) => (
            <TemplateItem
              key={template.templateId}
              template={template}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-end px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={onClose} />
      </div>
    </div>
  );
}

function TemplateItem({ template, onSelect, onDelete }: TemplateItemProps) {
  const { activeIndex, getItemProps } = useModalDialogListNav();
  const { ref, index } = useListItem({ label: template.templateName });
  const isActive = activeIndex === index;

  return (
    <div className="group flex items-start gap-2 px-1.5 py-1 rounded-md border border-transparent hover:bg-surface-elevated transition-colors">
      <button
        ref={ref}
        type="button"
        tabIndex={isActive ? 0 : -1}
        className={cn(
          "flex-1 min-w-0 flex items-start gap-2.5 px-1.5 py-1 rounded text-left text-text-neutral hover:text-text-base transition-colors",
          isActive && "ring-1 ring-border-focus"
        )}
        {...getItemProps({
          onClick: () => onSelect(template),
        })}
      >
        <Bookmark className="w-4 h-4 shrink-0 mt-0.5 text-text-muted" />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-medium truncate text-text-base">{template.templateName}</span>
          {template.description && <span className="text-xs text-text-muted truncate">{template.description}</span>}
        </div>
      </button>
      <button
        type="button"
        tabIndex={isActive ? 0 : -1}
        className="shrink-0 p-1.5 rounded text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-error hover:bg-error/10 transition-all"
        onClick={() => onDelete(template)}
        title="Delete template"
        aria-label={`Delete template ${template.templateName}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
