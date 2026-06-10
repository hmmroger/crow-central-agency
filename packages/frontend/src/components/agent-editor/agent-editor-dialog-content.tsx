import { useCallback, useEffect, useImperativeHandle, useState } from "react";
import type { Ref } from "react";
import { BookmarkPlus, Sparkles, Trash2 } from "lucide-react";
import {
  AGENT_TYPE,
  TOOL_MODE,
  type AgentConfigTemplate,
  type AgentType,
  type CreateAgentInput,
  type UpdateAgentInput,
} from "@crow-central-agency/shared";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { useConfirmDiscard } from "../../hooks/dialogs/use-confirm-discard.js";
import { usePromptDialog } from "../../hooks/dialogs/use-prompt-dialog.js";
import { useAgentQuery } from "../../hooks/queries/use-agent-query.js";
import { useSystemCapabilitiesQuery } from "../../hooks/queries/use-system-capabilities-query.js";
import {
  useCreateAgent,
  useDeleteAgent,
  useSaveAgentAsTemplate,
  useUpdateAgent,
} from "../../hooks/queries/use-agent-mutations.js";
import { useMcpConfigsQuery } from "../../hooks/queries/use-mcp-configs-query.js";
import { useAgentMcpConfigsQuery } from "../../hooks/queries/use-agent-mcp-configs-query.js";
import type { ModalDialogHandle } from "../../providers/modal-dialog-provider.types.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { useAgentEditorForm } from "./use-agent-editor-form.js";
import { BasicInfoSection } from "./basic-info-section.js";
import { VoiceConfigSection } from "./voice-config-section.js";
import { SystemPromptSection } from "./system-prompt-section.js";
import { PermissionModeSection } from "./permission-mode-section.js";
import { SettingSourcesSection } from "./setting-sources-section.js";
import { ToolConfigSection } from "./tool-config-section.js";
import { McpServersSection } from "./mcp-servers-section.js";
import { GmailNotificationSection } from "./gmail-notification-section.js";
import { SensorsSection } from "./sensors-section.js";
import { FeedsSection } from "./feeds-section.js";
import { LoopConfigPanel } from "./loop-config-panel.js";
import { AgentMdEditor } from "./agentmd-editor.js";
import { DiscordConfigSection } from "./discord-config-section.js";
import { ConnectorsSection } from "./connectors-section.js";
import { GenerateModal } from "./generate-modal.js";

interface AgentEditorDialogContentProps {
  agentId?: string;
  /** Template to prefill the form from when creating a new agent */
  templatePreset?: AgentConfigTemplate;
  /** Provider type for a new agent */
  agentType?: AgentType;
  /** Injected by modal dialog provider — closes the modal */
  onClose: () => void;
  /** Injected by modal dialog renderer for dismiss guard */
  ref: Ref<ModalDialogHandle>;
}

/**
 * Agent editor rendered as modal dialog content.
 * Composes section components for modular form layout.
 * Uses useAgentEditorForm hook for state management and dirty tracking.
 * Exposes ModalDialogHandle so the renderer can check canDismiss before closing.
 */
export function AgentEditorDialogContent({
  agentId,
  templatePreset,
  agentType = AGENT_TYPE.CLAUDE_CODE,
  onClose,
  ref,
}: AgentEditorDialogContentProps) {
  const confirm = useConfirmDialog();
  const prompt = usePromptDialog();
  const isEditing = agentId !== undefined;

  // Query for loading existing agent when editing
  const agentQuery = useAgentQuery(agentId);
  const { data: capabilities } = useSystemCapabilitiesQuery();
  const canGenerate = capabilities?.textGeneration === true;

  // Mutations
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent(agentId ?? "");
  const { deleteFn, isPending: isDeleting } = useDeleteAgent(agentId ?? "");
  const saveAsTemplate = useSaveAgentAsTemplate(agentId ?? "");
  const { mutateAsync: createMutateAsync } = createAgent;
  const { mutateAsync: updateMutateAsync } = updateAgent;
  const { mutateAsync: saveAsTemplateMutateAsync, isPending: isSavingTemplate } = saveAsTemplate;
  const saveMutation = isEditing ? updateAgent : createAgent;
  const isSaving = saveMutation.isPending;
  const mutationError = saveMutation.error?.message ?? agentQuery.error?.message;

  // MCP configs for server selection
  const { data: agentMcpConfigs = [] } = useAgentMcpConfigsQuery(agentId);
  const { data: globalMcpConfigs = [] } = useMcpConfigsQuery({ enabled: !isEditing });
  const mcpConfigs = isEditing ? agentMcpConfigs : globalMcpConfigs;

  // An existing agent's saved type wins; the prop only seeds new agents.
  const effectiveAgentType = agentQuery.data?.type ?? agentType;

  // Form state with dirty tracking
  const editorForm = useAgentEditorForm(effectiveAgentType, agentQuery.data, templatePreset);
  const { form, isDirty } = editorForm;

  const [generateModalType, setGenerateModalType] = useState<"persona" | "agentmd" | undefined>(undefined);

  const confirmDiscard = useConfirmDiscard(isDirty);

  // Expose canDismiss to the modal dialog renderer — guards ESC/backdrop dismiss
  useImperativeHandle(
    ref,
    () => ({
      canDismiss: confirmDiscard,
    }),
    [confirmDiscard]
  );

  /** Save - create or update */
  const handleSave = useCallback(async () => {
    const loopConfig = {
      enabled: form.loopEnabled,
      daysOfWeek: form.loopDays,
      timeMode: form.loopTimeMode,
      times: form.loopTimes,
      prompt: form.loopPrompt,
    };

    const discordConfig = {
      enabled: form.discordEnabled,
      botToken: form.discordBotToken,
      channelIds: form.discordChannelIds.length > 0 ? form.discordChannelIds : undefined,
      allowedUserIds: form.discordAllowedUserIds.length > 0 ? form.discordAllowedUserIds : undefined,
      respondToMentionsOnly: form.discordRespondToMentionsOnly,
      syncBotName: form.discordSyncBotName,
    };

    const trimmedVoiceName = form.voiceName.trim();
    const trimmedVoiceStylePrompt = form.voiceStylePrompt.trim();
    const existingVoiceConfig = agentQuery.data?.agentVoiceConfig;
    const hadVoiceConfigData = !!(existingVoiceConfig?.voiceName || existingVoiceConfig?.stylePrompt);
    const agentVoiceConfig = form.voiceConfigEnabled
      ? {
          voiceName: trimmedVoiceName || undefined,
          stylePrompt: trimmedVoiceStylePrompt || undefined,
        }
      : hadVoiceConfigData
        ? {}
        : undefined;

    try {
      if (isEditing) {
        const input: UpdateAgentInput = {
          name: form.name,
          description: form.description,
          workspace: form.workspace.trim() || "",
          persona: form.persona,
          model: form.model,
          permissionMode: form.permissionMode,
          settingSources: form.settingSources,
          toolConfig: {
            mode: form.toolMode,
            tools: form.toolMode === TOOL_MODE.RESTRICTED ? form.selectedTools : undefined,
            autoApprovedTools: form.autoApprovedTools.length > 0 ? form.autoApprovedTools : undefined,
            disallowedTools: form.disallowedTools.length > 0 ? form.disallowedTools : undefined,
          },
          agentVoiceConfig,
          mcpServerIds: form.mcpServerIds,
          sensorIds: form.sensorIds,
          configuredFeeds: form.configuredFeeds,
          loop: loopConfig,
          discordConfig,
          excludeClaudeCodeSystemPrompt: form.excludeClaudeCodeSystemPrompt,
          enableGmailNotification: form.enableGmailNotification,
          agentMd: form.agentMd.trim() || undefined,
        };

        await updateMutateAsync(input);
      } else {
        const input: CreateAgentInput = {
          type: agentType,
          name: form.name,
          workspace: form.workspace.trim() || undefined,
          description: form.description || undefined,
          persona: form.persona || undefined,
          model: form.model,
          permissionMode: form.permissionMode,
          settingSources: form.settingSources,
          toolConfig: {
            mode: form.toolMode,
            tools: form.toolMode === TOOL_MODE.RESTRICTED ? form.selectedTools : undefined,
            autoApprovedTools: form.autoApprovedTools.length > 0 ? form.autoApprovedTools : undefined,
            disallowedTools: form.disallowedTools.length > 0 ? form.disallowedTools : undefined,
          },
          agentVoiceConfig,
          mcpServerIds: form.mcpServerIds,
          sensorIds: form.sensorIds,
          configuredFeeds: form.configuredFeeds,
          loop: loopConfig,
          discordConfig: discordConfig,
          excludeClaudeCodeSystemPrompt: form.excludeClaudeCodeSystemPrompt ? true : undefined,
          enableGmailNotification: form.enableGmailNotification ? true : undefined,
          agentMd: form.agentMd.trim() || undefined,
        };

        await createMutateAsync(input);
      }

      onClose();
    } catch {
      // Error is surfaced via mutation.error in the UI
    }
  }, [form, isEditing, agentType, updateMutateAsync, createMutateAsync, onClose, agentQuery.data?.agentVoiceConfig]);

  /** Prompt for a template name and save the current agent as a template */
  const handleSaveAsTemplate = useCallback(() => {
    if (!agentId) {
      return;
    }

    prompt({
      title: "Save as Template",
      label: "Template name",
      placeholder: `${form.name || "Agent"} template`,
      maxLength: 64,
      confirmLabel: "Save",
      onConfirm: async (templateName) => {
        await saveAsTemplateMutateAsync(templateName);
      },
    });
  }, [agentId, prompt, form.name, saveAsTemplateMutateAsync]);

  /** Delete the agent after confirmation */
  const handleDelete = useCallback(() => {
    if (!agentId) {
      return;
    }

    confirm({
      title: "Delete Agent",
      message: "This will permanently delete the agent and all its data. This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteFn();
          onClose();
        } catch {
          // Error is surfaced via mutation.error in the UI
        }
      },
    });
  }, [agentId, confirm, deleteFn, onClose]);

  /** Cancel — confirms discard when dirty, closes directly when clean */
  const handleCancel = useCallback(async () => {
    const allowed = await confirmDiscard();
    if (allowed) {
      onClose();
    }
  }, [confirmDiscard, onClose]);

  const canSave = !isSaving && !!form.name.trim() && !!(form.description ?? "").trim() && (isEditing ? isDirty : true);

  // System agents are immutable — redirect to dashboard
  const isSystemAgentAttempt = isEditing && agentQuery.data?.isSystemAgent === true;

  useEffect(() => {
    if (isSystemAgentAttempt) {
      onClose();
    }
  }, [isSystemAgentAttempt, onClose]);

  if (isEditing && agentQuery.isLoading) {
    return <div className="flex items-center justify-center p-12 text-text-muted">Loading agent...</div>;
  }

  if (isEditing && agentQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12">
        <p className="text-error text-sm">Failed to load agent: {agentQuery.error.message}</p>
        <button
          type="button"
          className="text-sm text-text-muted hover:text-text-base transition-colors"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    );
  }

  if (isSystemAgentAttempt) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {/* Error */}
        {mutationError && (
          <div className="mb-6 p-3 rounded-md bg-error/10 border border-error/20 text-error text-sm animate-fade-slide-up">
            {mutationError}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left column - settings */}
          <div className="flex flex-col flex-1 min-w-0 space-y-6">
            <BasicInfoSection
              name={form.name}
              description={form.description}
              workspace={form.workspace}
              model={form.model}
              agentType={effectiveAgentType}
              persona={form.persona}
              onNameChange={editorForm.setName}
              onDescriptionChange={editorForm.setDescription}
              onWorkspaceChange={editorForm.setWorkspace}
              onModelChange={editorForm.setModel}
              onPersonaChange={editorForm.setPersona}
              onGeneratePersona={() => setGenerateModalType("persona")}
              canGenerate={canGenerate}
            />

            <VoiceConfigSection
              enabled={form.voiceConfigEnabled}
              voiceName={form.voiceName}
              voiceStylePrompt={form.voiceStylePrompt}
              onEnabledChange={editorForm.setVoiceConfigEnabled}
              onVoiceNameChange={editorForm.setVoiceName}
              onVoiceStylePromptChange={editorForm.setVoiceStylePrompt}
            />

            <SystemPromptSection
              excludeClaudeCodeSystemPrompt={form.excludeClaudeCodeSystemPrompt}
              agentType={effectiveAgentType}
              onExcludeClaudeCodeSystemPromptChange={editorForm.setExcludeClaudeCodeSystemPrompt}
            />

            <PermissionModeSection
              permissionMode={form.permissionMode}
              agentType={effectiveAgentType}
              onPermissionModeChange={editorForm.setPermissionMode}
            />

            <SettingSourcesSection
              settingSources={form.settingSources}
              agentType={effectiveAgentType}
              onSettingSourcesChange={editorForm.setSettingSources}
            />

            <ToolConfigSection
              agentType={effectiveAgentType}
              toolMode={form.toolMode}
              selectedTools={form.selectedTools}
              autoApprovedTools={form.autoApprovedTools}
              disallowedTools={form.disallowedTools}
              disallowedToolsEnabled={form.disallowedToolsEnabled}
              availableTools={form.availableTools}
              onToolModeChange={editorForm.setToolMode}
              onToggleTool={editorForm.toggleTool}
              onToggleAutoApproved={editorForm.toggleAutoApproved}
              onAddCustomAutoApproved={editorForm.addCustomAutoApproved}
              onDisallowedToolsEnabledChange={editorForm.setDisallowedToolsEnabled}
              onToggleDisallowedTool={editorForm.toggleDisallowedTool}
              onAddCustomDisallowedTool={editorForm.addCustomDisallowedTool}
            />
          </div>

          {/* Right column - AGENT.md editor */}
          <div className="flex flex-col flex-1 min-w-0 space-y-6">
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <label className="text-sm font-medium text-text-neutral">AGENT.md</label>
              <button
                type="button"
                className="text-text-muted hover:text-secondary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-text-muted transition-colors"
                onClick={() => setGenerateModalType("agentmd")}
                disabled={!canGenerate}
                title={canGenerate ? "Generate with AI" : "Text generation is not configured"}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 max-h-agentmd-editor">
              <AgentMdEditor value={form.agentMd} onChange={editorForm.setAgentMd} />
            </div>

            <McpServersSection
              configs={mcpConfigs}
              mcpServerIds={form.mcpServerIds}
              onToggle={editorForm.toggleMcpServer}
            />

            <GmailNotificationSection
              enabled={form.enableGmailNotification}
              onEnabledChange={editorForm.setEnableGmailNotification}
            />

            <ConnectorsSection agentId={agentId} />

            <SensorsSection sensorIds={form.sensorIds} onToggle={editorForm.toggleSensor} />

            <FeedsSection
              configuredFeeds={form.configuredFeeds}
              onToggle={editorForm.toggleFeed}
              onToggleNotify={editorForm.toggleFeedNotify}
            />

            <LoopConfigPanel
              enabled={form.loopEnabled}
              daysOfWeek={form.loopDays}
              timeMode={form.loopTimeMode}
              times={form.loopTimes}
              prompt={form.loopPrompt}
              onEnabledChange={editorForm.setLoopEnabled}
              onDaysChange={editorForm.setLoopDays}
              onTimeModeChange={editorForm.setLoopTimeMode}
              onTimesChange={editorForm.setLoopTimes}
              onPromptChange={editorForm.setLoopPrompt}
            />

            <DiscordConfigSection
              enabled={form.discordEnabled}
              botToken={form.discordBotToken}
              channelIds={form.discordChannelIds}
              allowedUserIds={form.discordAllowedUserIds}
              respondToMentionsOnly={form.discordRespondToMentionsOnly}
              onEnabledChange={editorForm.setDiscordEnabled}
              onBotTokenChange={editorForm.setDiscordBotToken}
              onAddChannelId={editorForm.addDiscordChannelId}
              onRemoveChannelId={editorForm.removeDiscordChannelId}
              onAddAllowedUserId={editorForm.addDiscordAllowedUserId}
              onRemoveAllowedUserId={editorForm.removeDiscordAllowedUserId}
              onRespondToMentionsOnlyChange={editorForm.setDiscordRespondToMentionsOnly}
              syncBotName={form.discordSyncBotName}
              onSyncBotNameChange={editorForm.setDiscordSyncBotName}
            />
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
          {isEditing && (
            <ActionButton
              icon={BookmarkPlus}
              label={isSavingTemplate ? "Saving..." : "Save as Template"}
              onClick={handleSaveAsTemplate}
              disabled={isSavingTemplate || isDirty}
            />
          )}
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
