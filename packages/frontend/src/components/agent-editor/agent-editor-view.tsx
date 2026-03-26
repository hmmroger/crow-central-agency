import { useCallback, useState } from "react";
import { Sparkles, Trash2, X } from "lucide-react";
import { DEFAULT_MODEL, TOOL_MODE, type CreateAgentInput, type UpdateAgentInput } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";
import { useAgentQuery } from "../../hooks/use-agent-query.js";
import { useCreateAgent, useUpdateAgent, useDeleteAgent } from "../../hooks/use-agent-mutations.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { ActionBarButton } from "../layout/action-bar.js";
import { useAgentEditorForm } from "./use-agent-editor-form.js";
import { BasicInfoSection } from "./basic-info-section.js";
import { PermissionModeSection } from "./permission-mode-section.js";
import { SettingSourcesSection } from "./setting-sources-section.js";
import { ToolConfigSection } from "./tool-config-section.js";
import { FieldGroup } from "./field-group.js";
import { LoopConfigPanel } from "./loop-config-panel.js";
import { AgentMdEditor } from "./agentmd-editor.js";
import { GenerateModal } from "./generate-modal.js";

interface AgentEditorViewProps {
  agentId?: string;
}

/**
 * Full view for creating or editing an agent.
 * Composes section components for modular form layout.
 * Uses useAgentEditorForm hook for state management and dirty tracking.
 */
export function AgentEditorView({ agentId }: AgentEditorViewProps) {
  const goToDashboard = useAppStore((state) => state.goToDashboard);
  const isEditing = agentId !== undefined;

  // Query for loading existing agent when editing
  const agentQuery = useAgentQuery(agentId);

  // Mutations
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent(agentId ?? "");
  const { deleteFn, isPending: isDeleting } = useDeleteAgent(agentId ?? "");
  const { mutateAsync: createMutateAsync } = createAgent;
  const { mutateAsync: updateMutateAsync } = updateAgent;
  const saveMutation = isEditing ? updateAgent : createAgent;
  const isSaving = saveMutation.isPending;
  const mutationError = saveMutation.error?.message ?? agentQuery.error?.message;

  // Form state with dirty tracking
  const editorForm = useAgentEditorForm(agentQuery.data);
  const { form, isDirty } = editorForm;

  const [generateModalType, setGenerateModalType] = useState<"persona" | "agentmd" | undefined>(undefined);

  /** Save — create or update */
  const handleSave = useCallback(async () => {
    const loopConfig = {
      enabled: form.loopEnabled,
      daysOfWeek: form.loopDays,
      timeMode: form.loopTimeMode,
      hour: form.loopHour,
      minute: form.loopMinute,
      prompt: form.loopPrompt,
    };

    try {
      if (isEditing) {
        const input: UpdateAgentInput = {
          name: form.name,
          description: form.description,
          workspace: form.workspace,
          persona: form.persona,
          model: form.model,
          permissionMode: form.permissionMode,
          settingSources: form.settingSources,
          toolConfig: {
            mode: form.toolMode,
            tools: form.toolMode === TOOL_MODE.RESTRICTED ? form.selectedTools : undefined,
            autoApprovedTools: form.autoApprovedTools.length > 0 ? form.autoApprovedTools : undefined,
          },
          loop: loopConfig,
          agentMd: form.agentMd.trim() || undefined,
        };

        await updateMutateAsync(input);
      } else {
        const input: CreateAgentInput = {
          name: form.name,
          workspace: form.workspace,
          description: form.description || undefined,
          persona: form.persona || undefined,
          model: form.model !== DEFAULT_MODEL ? form.model : undefined,
          permissionMode: form.permissionMode,
          settingSources: form.settingSources,
          toolConfig: {
            mode: form.toolMode,
            tools: form.toolMode === TOOL_MODE.RESTRICTED ? form.selectedTools : undefined,
            autoApprovedTools: form.autoApprovedTools.length > 0 ? form.autoApprovedTools : undefined,
          },
          loop: loopConfig,
          agentMd: form.agentMd.trim() || undefined,
        };

        await createMutateAsync(input);
      }

      goToDashboard();
    } catch {
      // Error is surfaced via mutation.error in the UI
    }
  }, [form, isEditing, updateMutateAsync, createMutateAsync, goToDashboard]);

  /** Delete the agent and return to dashboard */
  const handleDelete = useCallback(async () => {
    if (!agentId) {
      return;
    }

    try {
      await deleteFn();
      goToDashboard();
    } catch {
      // Error is surfaced via mutation.error in the UI
    }
  }, [agentId, deleteFn, goToDashboard]);

  const headerTitle = isEditing ? form.name || "Edit Agent" : "Create Agent";
  const canSave = !isSaving && !!form.name.trim() && !!form.workspace.trim() && (isEditing ? isDirty : true);

  if (isEditing && agentQuery.isLoading) {
    return (
      <>
        <HeaderPortal title={headerTitle} />
        <div className="h-full flex items-center justify-center text-text-muted">Loading agent...</div>
      </>
    );
  }

  if (isEditing && agentQuery.isError) {
    return (
      <>
        <HeaderPortal title="Edit Agent" />
        <div className="h-full flex items-center justify-center text-error text-sm">
          Failed to load agent: {agentQuery.error.message}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <HeaderPortal title={headerTitle} />

      {/* Action bar — save/delete (left), cancel (right) */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-1">
          {isEditing && (
            <ActionBarButton
              icon={Trash2}
              label={isDeleting ? "Deleting..." : "Delete"}
              onClick={handleDelete}
              disabled={isDeleting}
              isDestructive
            />
          )}
          <ActionBarButton
            label={isEditing ? (isSaving ? "Saving..." : "Save") : isSaving ? "Creating..." : "Create"}
            onClick={handleSave}
            disabled={!canSave}
            isPrimary
          />
        </div>
        <button
          type="button"
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
          onClick={goToDashboard}
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-12">
        {/* Error */}
        {mutationError && (
          <div className="mb-6 p-3 rounded-md bg-error/10 border border-error/20 text-error text-sm animate-[fade-slide-up_var(--duration-normal)_var(--ease-out)_both]">
            {mutationError}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left column — settings */}
          <div className="flex flex-col flex-1 min-w-0 space-y-6">
            <BasicInfoSection
              name={form.name}
              description={form.description}
              workspace={form.workspace}
              model={form.model}
              persona={form.persona}
              onNameChange={editorForm.setName}
              onDescriptionChange={editorForm.setDescription}
              onWorkspaceChange={editorForm.setWorkspace}
              onModelChange={editorForm.setModel}
              onPersonaChange={editorForm.setPersona}
              onGeneratePersona={() => setGenerateModalType("persona")}
            />

            <PermissionModeSection
              permissionMode={form.permissionMode}
              onPermissionModeChange={editorForm.setPermissionMode}
            />

            <SettingSourcesSection
              settingSources={form.settingSources}
              onSettingSourcesChange={editorForm.setSettingSources}
            />

            <ToolConfigSection
              toolMode={form.toolMode}
              selectedTools={form.selectedTools}
              autoApprovedTools={form.autoApprovedTools}
              availableTools={form.availableTools}
              onToolModeChange={editorForm.setToolMode}
              onToggleTool={editorForm.toggleTool}
              onToggleAutoApproved={editorForm.toggleAutoApproved}
              onAddCustomAutoApproved={editorForm.addCustomAutoApproved}
            />

            {/* Loop Configuration */}
            <FieldGroup label="Loop Schedule">
              <LoopConfigPanel
                enabled={form.loopEnabled}
                daysOfWeek={form.loopDays}
                timeMode={form.loopTimeMode}
                hour={form.loopHour}
                minute={form.loopMinute}
                prompt={form.loopPrompt}
                onEnabledChange={editorForm.setLoopEnabled}
                onDaysChange={editorForm.setLoopDays}
                onTimeModeChange={editorForm.setLoopTimeMode}
                onHourChange={editorForm.setLoopHour}
                onMinuteChange={editorForm.setLoopMinute}
                onPromptChange={editorForm.setLoopPrompt}
              />
            </FieldGroup>
          </div>

          {/* Right column — AGENT.md editor */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <label className="text-sm font-medium text-text-secondary">AGENT.md</label>
              <button
                type="button"
                className="text-text-muted hover:text-secondary transition-colors"
                onClick={() => setGenerateModalType("agentmd")}
                title="Generate with AI"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 max-h-96">
              <AgentMdEditor value={form.agentMd} onChange={editorForm.setAgentMd} />
            </div>
          </div>
        </div>

        {/* Generate Modal */}
        {generateModalType && (
          <GenerateModal
            type={generateModalType}
            context={
              generateModalType === "agentmd"
                ? [form.description, form.persona].filter(Boolean).join("\n") || undefined
                : form.description || undefined
            }
            onApply={(content) => {
              if (generateModalType === "persona") {
                editorForm.setPersona(content);
              } else {
                editorForm.setAgentMd(content);
              }
            }}
            onClose={() => setGenerateModalType(undefined)}
          />
        )}
      </div>
    </div>
  );
}
