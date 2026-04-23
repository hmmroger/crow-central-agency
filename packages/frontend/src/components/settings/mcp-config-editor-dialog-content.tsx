import { useCallback, useImperativeHandle } from "react";
import type { Ref } from "react";
import { Trash2 } from "lucide-react";
import { MCP_CONFIG_TYPE, type CreateMcpConfigInput } from "@crow-central-agency/shared";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { useConfirmDiscard } from "../../hooks/dialogs/use-confirm-discard.js";
import type { ModalDialogHandle } from "../../providers/modal-dialog-provider.types.js";
import { useMcpConfigsQuery } from "../../hooks/queries/use-mcp-configs-query.js";
import {
  useCreateMcpConfig,
  useUpdateMcpConfig,
  useDeleteMcpConfig,
} from "../../hooks/queries/use-mcp-config-mutations.js";
import { Toggle } from "../common/toggle.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { FieldGroup } from "../agent-editor/field-group.js";
import { useMcpConfigEditorForm } from "./use-mcp-config-editor-form.js";
import { KeyValueListField } from "./key-value-list-field.js";
import { StringListField } from "./string-list-field.js";
import type { KeyValuePair } from "./mcp-config-editor.types.js";
import { McpTypeSelector } from "./mcp-type-selector.js";

/** Convert KeyValuePair[] to Record, filtering empty keys */
function pairsToRecord(pairs: KeyValuePair[]): Record<string, string> | undefined {
  const filtered = pairs.filter((pair) => pair.key.trim() !== "");
  if (filtered.length === 0) {
    return undefined;
  }

  const record: Record<string, string> = {};
  for (const pair of filtered) {
    record[pair.key.trim()] = pair.value;
  }

  return record;
}

/** Filter empty strings from args array */
function filterArgs(args: string[]): string[] | undefined {
  const filtered = args.filter((arg) => arg.trim() !== "");

  return filtered.length > 0 ? filtered : undefined;
}

interface McpConfigEditorDialogContentProps {
  configId?: string;
  /** Injected by modal dialog provider */
  onClose: () => void;
  /** Injected by modal dialog renderer for dismiss guard */
  ref: Ref<ModalDialogHandle>;
}

/**
 * MCP config editor rendered as modal dialog content.
 * Handles create and edit flows with dirty tracking.
 * Exposes ModalDialogHandle so the renderer can check canDismiss before closing.
 */
export function McpConfigEditorDialogContent({ configId, onClose, ref }: McpConfigEditorDialogContentProps) {
  const confirm = useConfirmDialog();
  const isEditing = configId !== undefined;

  // Get existing config when editing
  const { data: configs = [] } = useMcpConfigsQuery();
  const existingConfig = isEditing ? configs.find((config) => config.id === configId) : undefined;

  // Mutations
  const createMcpConfig = useCreateMcpConfig();
  const updateMcpConfig = useUpdateMcpConfig(configId ?? "");
  const { deleteFn, isPending: isDeleting } = useDeleteMcpConfig(configId ?? "");
  const saveMutation = isEditing ? updateMcpConfig : createMcpConfig;
  const isSaving = saveMutation.isPending;
  const mutationError = saveMutation.error?.message;

  // Form state
  const editorForm = useMcpConfigEditorForm(existingConfig);
  const { form, isDirty } = editorForm;

  const confirmDiscard = useConfirmDiscard(isDirty);

  // Expose canDismiss to the modal dialog renderer — guards ESC/backdrop dismiss
  useImperativeHandle(
    ref,
    () => ({
      canDismiss: confirmDiscard,
    }),
    [confirmDiscard]
  );

  const isStdio = form.type === MCP_CONFIG_TYPE.STDIO;
  const canSave =
    !isSaving &&
    form.name.trim() !== "" &&
    (isStdio ? form.command.trim() !== "" : form.url.trim() !== "") &&
    (isEditing ? isDirty : true);

  /** Build and submit the config */
  const handleSave = useCallback(async () => {
    const baseFields = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      isDisabled: form.isDisabled,
      enableForCrow: form.enableForCrow,
    };

    try {
      if (form.type === MCP_CONFIG_TYPE.STDIO) {
        const input: CreateMcpConfigInput = {
          ...baseFields,
          type: form.type,
          command: form.command.trim(),
          args: filterArgs(form.args),
          env: pairsToRecord(form.env),
        };

        if (isEditing) {
          await updateMcpConfig.mutateAsync(input);
        } else {
          await createMcpConfig.mutateAsync(input);
        }
      } else {
        const input: CreateMcpConfigInput = {
          ...baseFields,
          type: form.type,
          url: form.url.trim(),
          headers: pairsToRecord(form.headers),
        };

        if (isEditing) {
          await updateMcpConfig.mutateAsync(input);
        } else {
          await createMcpConfig.mutateAsync(input);
        }
      }

      onClose();
    } catch {
      // Error surfaced via mutation.error
    }
  }, [form, isEditing, updateMcpConfig, createMcpConfig, onClose]);

  /** Delete with confirmation */
  const handleDelete = useCallback(() => {
    if (!configId) {
      return;
    }

    confirm({
      title: "Delete MCP Server",
      message: `Delete "${form.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await deleteFn();
        onClose();
      },
    });
  }, [configId, form.name, confirm, deleteFn, onClose]);

  /** Cancel — confirms discard when dirty, closes directly when clean */
  const handleCancel = useCallback(async () => {
    const allowed = await confirmDiscard();
    if (allowed) {
      onClose();
    }
  }, [confirmDiscard, onClose]);

  return (
    <div className="flex flex-col min-h-0">
      {/* Scrollable form */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
        {/* Error banner */}
        {mutationError && (
          <div className="p-3 rounded-md bg-error/10 border border-error/20 text-error text-sm animate-fade-slide-up">
            {mutationError}
          </div>
        )}

        {/* Name */}
        <FieldGroup label="Name">
          <input
            type="text"
            value={form.name}
            onChange={(event) => editorForm.setName(event.target.value)}
            placeholder="Server name"
            maxLength={64}
            className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
          <p className="text-3xs text-text-muted mt-1">Letters, numbers, and spaces only</p>
        </FieldGroup>

        {/* Description */}
        <FieldGroup label="Description">
          <input
            type="text"
            value={form.description}
            onChange={(event) => editorForm.setDescription(event.target.value)}
            placeholder="Optional description"
            className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
        </FieldGroup>

        {/* Type */}
        <FieldGroup label="Type">
          <McpTypeSelector value={form.type} onChange={editorForm.setType} menuId="mcp-config-type" />
        </FieldGroup>

        {/* Type-specific fields */}
        {isStdio ? (
          <>
            <FieldGroup label="Command">
              <input
                type="text"
                value={form.command}
                onChange={(event) => editorForm.setCommand(event.target.value)}
                placeholder="e.g. npx, python, node"
                className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
              />
            </FieldGroup>

            <FieldGroup label="Arguments">
              <StringListField
                items={form.args}
                onUpdate={editorForm.updateArg}
                onAdd={editorForm.addArg}
                onRemove={editorForm.removeArg}
                placeholder="Argument"
              />
            </FieldGroup>

            <FieldGroup label="Environment Variables">
              <KeyValueListField
                pairs={form.env}
                onUpdate={editorForm.updateEnvPair}
                onAdd={editorForm.addEnvPair}
                onRemove={editorForm.removeEnvPair}
                keyPlaceholder="Variable"
                valuePlaceholder="Value"
              />
            </FieldGroup>
          </>
        ) : (
          <>
            <FieldGroup label="URL">
              <input
                type="text"
                value={form.url}
                onChange={(event) => editorForm.setUrl(event.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
              />
            </FieldGroup>

            <FieldGroup label="Headers">
              <KeyValueListField
                pairs={form.headers}
                onUpdate={editorForm.updateHeaderPair}
                onAdd={editorForm.addHeaderPair}
                onRemove={editorForm.removeHeaderPair}
                keyPlaceholder="Header"
                valuePlaceholder="Value"
              />
            </FieldGroup>
          </>
        )}

        {/* Toggles */}
        <div className="flex flex-col gap-2">
          <Toggle
            checked={!form.isDisabled}
            onChange={(enabled) => editorForm.setIsDisabled(!enabled)}
            label="Enabled"
          />
          <Toggle checked={form.enableForCrow} onChange={editorForm.setEnableForCrow} label="Enable for Crow" />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-elevated">
        <div>
          {isEditing && (
            <ActionButton
              icon={Trash2}
              label={isDeleting ? "Deleting..." : "Delete"}
              onClick={handleDelete}
              disabled={isDeleting}
              variant={ACTION_BUTTON_VARIANT.DESTRUCTIVE}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <ActionButton label="Cancel" onClick={handleCancel} />
          <ActionButton
            label={isEditing ? (isSaving ? "Saving..." : "Save") : isSaving ? "Creating..." : "Create"}
            onClick={handleSave}
            disabled={!canSave}
            variant={ACTION_BUTTON_VARIANT.PRIMARY}
          />
        </div>
      </div>
    </div>
  );
}
