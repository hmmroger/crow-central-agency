import { useCallback, useEffect, useRef, useState } from "react";
import {
  AGENT_TYPE,
  CLAUDE_DEFAULT_MODEL,
  COPILOT_DEFAULT_MODEL,
  DEFAULT_SETTING_SOURCES,
  PERMISSION_MODE,
  TOOL_MODE,
  type AgentConfigTemplate,
  type AgentThinkingConfig,
  type AgentType,
  type ContextAutoCompactionConfig,
  type ConfiguredFeed,
  type ReasoningEffort,
  type PermissionMode,
  type SettingSource,
  type ToolMode,
} from "@crow-central-agency/shared";
import type { AgentDetailData, AgentEditorFormState } from "./agent-editor.types.js";
import { BUILTIN_TOOL_SET_BY_TYPE } from "./tool-config/tool-constants.js";
import { arraysEqual } from "../../utils/array-utils.js";

/** Default form state for a new agent */
const DEFAULT_FORM_STATE: AgentEditorFormState = {
  name: "",
  description: "",
  workspace: "",
  persona: "",
  model: CLAUDE_DEFAULT_MODEL,
  effort: undefined,
  thinkingConfig: undefined,
  contextAutoCompactionEnabled: false,
  contextAutoCompactionThreshold: undefined,
  permissionMode: PERMISSION_MODE.DEFAULT,
  settingSources: [...DEFAULT_SETTING_SOURCES],
  disableFileHooks: false,
  disabledInstructionSources: [],
  instructionSources: [],
  discoveredSkills: [],
  disabledSkills: [],
  toolMode: TOOL_MODE.UNRESTRICTED,
  selectedTools: [],
  autoApprovedTools: [],
  disallowedTools: [],
  availableTools: [],
  mcpServerIds: [],
  sensorIds: [],
  configuredFeeds: [],
  discordEnabled: false,
  discordBotToken: "",
  discordChannelIds: [],
  discordAllowedUserIds: [],
  discordRespondToMentionsOnly: false,
  discordSyncBotName: false,
  excludeClaudeCodeSystemPrompt: false,
  enableGmailNotification: false,
  agentMd: "",
  voiceConfigEnabled: false,
  voiceName: "",
  voiceStylePrompt: "",
};

/** Default model for a new agent, picked by provider. */
function defaultModelForType(agentType: AgentType): string {
  return agentType === AGENT_TYPE.GITHUB_COPILOT ? COPILOT_DEFAULT_MODEL : CLAUDE_DEFAULT_MODEL;
}

/**
 * Flatten the provider-agnostic compaction config into the editor's single enabled + threshold pair.
 * Only one provider field is ever set for a given agent, so the first defined value wins.
 */
function compactionThresholdFromConfig(config: ContextAutoCompactionConfig | undefined): number | undefined {
  return config?.tokensThreshold ?? config?.utilizationThreshold;
}

/**
 * Build form state from a saved template. Leaves fields that templates
 * do not capture (name, discord config) at their defaults so the user
 * fills them in during create.
 */
function formStateFromTemplate(template: AgentConfigTemplate): AgentEditorFormState {
  return {
    ...DEFAULT_FORM_STATE,
    description: template.description ?? "",
    workspace: template.workspace ?? "",
    persona: template.persona ?? "",
    model: template.model,
    effort: template.effort,
    thinkingConfig: template.thinkingConfig,
    contextAutoCompactionEnabled: compactionThresholdFromConfig(template.contextAutoCompactionConfig) !== undefined,
    contextAutoCompactionThreshold: compactionThresholdFromConfig(template.contextAutoCompactionConfig),
    permissionMode: template.permissionMode,
    settingSources: template.settingSources,
    toolMode: template.toolConfig.mode,
    selectedTools: template.toolConfig.tools ?? [],
    autoApprovedTools: template.toolConfig.autoApprovedTools ?? [],
    disallowedTools: template.toolConfig.disallowedTools ?? [],
    availableTools: template.availableTools ?? [],
    mcpServerIds: template.mcpServerIds ?? [],
    sensorIds: template.sensorIds ?? [],
    configuredFeeds: template.configuredFeeds ?? [],
    agentMd: template.agentMd ?? "",
  };
}

/** Build form state from an existing agent config */
function formStateFromAgent(agent: AgentDetailData): AgentEditorFormState {
  return {
    name: agent.name,
    description: agent.description,
    workspace: agent.workspace ?? "",
    persona: agent.persona,
    model: agent.model,
    effort: agent.effort,
    thinkingConfig: agent.thinkingConfig,
    contextAutoCompactionEnabled: compactionThresholdFromConfig(agent.contextAutoCompactionConfig) !== undefined,
    contextAutoCompactionThreshold: compactionThresholdFromConfig(agent.contextAutoCompactionConfig),
    permissionMode: agent.permissionMode,
    settingSources: agent.settingSources,
    disableFileHooks: agent.settingSourceConfig?.disableFileHooks ?? false,
    disabledInstructionSources: agent.settingSourceConfig?.disabledInstructionSources ?? [],
    instructionSources: agent.settingSourceConfig?.instructionSources ?? [],
    discoveredSkills: agent.settingSourceConfig?.discoveredSkills ?? [],
    disabledSkills: agent.settingSourceConfig?.disabledSkills ?? [],
    toolMode: agent.toolConfig.mode,
    selectedTools: agent.toolConfig.tools ?? [],
    autoApprovedTools: agent.toolConfig.autoApprovedTools ?? [],
    disallowedTools: agent.toolConfig.disallowedTools ?? [],
    availableTools: agent.availableTools ?? [],
    mcpServerIds: agent.mcpServerIds ?? [],
    sensorIds: agent.sensorIds ?? [],
    configuredFeeds: agent.configuredFeeds ?? [],
    discordEnabled: agent.discordConfig?.enabled ?? false,
    discordBotToken: agent.discordConfig?.botToken ?? "",
    discordChannelIds: agent.discordConfig?.channelIds ?? [],
    discordAllowedUserIds: agent.discordConfig?.allowedUserIds ?? [],
    discordRespondToMentionsOnly: agent.discordConfig?.respondToMentionsOnly ?? false,
    discordSyncBotName: agent.discordConfig?.syncBotName ?? false,
    excludeClaudeCodeSystemPrompt: agent.excludeClaudeCodeSystemPrompt ?? false,
    enableGmailNotification: agent.enableGmailNotification ?? false,
    agentMd: agent.agentMd ?? "",
    voiceConfigEnabled: !!(agent.agentVoiceConfig?.voiceName || agent.agentVoiceConfig?.stylePrompt),
    voiceName: agent.agentVoiceConfig?.voiceName ?? "",
    voiceStylePrompt: agent.agentVoiceConfig?.stylePrompt ?? "",
  };
}

/** Deep equality check for form state - compares all fields including arrays */
function isFormEqual(formA: AgentEditorFormState, formB: AgentEditorFormState): boolean {
  return (
    formA.name === formB.name &&
    formA.description === formB.description &&
    formA.workspace === formB.workspace &&
    formA.persona === formB.persona &&
    formA.model === formB.model &&
    formA.effort === formB.effort &&
    formA.thinkingConfig?.mode === formB.thinkingConfig?.mode &&
    formA.thinkingConfig?.budget === formB.thinkingConfig?.budget &&
    formA.contextAutoCompactionEnabled === formB.contextAutoCompactionEnabled &&
    formA.contextAutoCompactionThreshold === formB.contextAutoCompactionThreshold &&
    formA.permissionMode === formB.permissionMode &&
    formA.toolMode === formB.toolMode &&
    formA.agentMd === formB.agentMd &&
    arraysEqual(formA.settingSources, formB.settingSources) &&
    // instructionSources is runtime-managed (not user-editable), so it is intentionally excluded here.
    formA.disableFileHooks === formB.disableFileHooks &&
    arraysEqual(formA.disabledInstructionSources, formB.disabledInstructionSources) &&
    // discoveredSkills is runtime-managed (not user-editable), so it is intentionally excluded here.
    arraysEqual(formA.disabledSkills, formB.disabledSkills) &&
    arraysEqual(formA.selectedTools, formB.selectedTools) &&
    arraysEqual(formA.autoApprovedTools, formB.autoApprovedTools) &&
    arraysEqual(formA.disallowedTools, formB.disallowedTools) &&
    arraysEqual(formA.availableTools, formB.availableTools) &&
    arraysEqual(formA.mcpServerIds, formB.mcpServerIds) &&
    arraysEqual(formA.sensorIds, formB.sensorIds) &&
    configuredFeedsEqual(formA.configuredFeeds, formB.configuredFeeds) &&
    formA.discordEnabled === formB.discordEnabled &&
    formA.discordBotToken === formB.discordBotToken &&
    formA.discordRespondToMentionsOnly === formB.discordRespondToMentionsOnly &&
    formA.discordSyncBotName === formB.discordSyncBotName &&
    formA.excludeClaudeCodeSystemPrompt === formB.excludeClaudeCodeSystemPrompt &&
    formA.enableGmailNotification === formB.enableGmailNotification &&
    arraysEqual(formA.discordChannelIds, formB.discordChannelIds) &&
    arraysEqual(formA.discordAllowedUserIds, formB.discordAllowedUserIds) &&
    formA.voiceConfigEnabled === formB.voiceConfigEnabled &&
    formA.voiceName === formB.voiceName &&
    formA.voiceStylePrompt === formB.voiceStylePrompt
  );
}

/** Deep equality check for ConfiguredFeed arrays (order-independent, keyed by feedId) */
function configuredFeedsEqual(feedsA: ConfiguredFeed[], feedsB: ConfiguredFeed[]): boolean {
  if (feedsA.length !== feedsB.length) {
    return false;
  }

  const byIdB = new Map(feedsB.map((feed) => [feed.feedId, feed]));
  return feedsA.every((feed) => {
    const match = byIdB.get(feed.feedId);
    return match !== undefined && match.isNotify === feed.isNotify;
  });
}

/**
 * Encapsulates all agent editor form state with dirty tracking.
 * Provides field values, setters, isDirty, and the current form snapshot.
 *
 * @param agent - Existing agent data (undefined for create mode)
 * @param templatePreset - Optional template to prefill from when creating a new agent
 */
export function useAgentEditorForm(
  agentType: AgentType,
  agent?: AgentDetailData,
  templatePreset?: AgentConfigTemplate
) {
  const [form, setForm] = useState<AgentEditorFormState>(() =>
    templatePreset
      ? formStateFromTemplate(templatePreset)
      : { ...DEFAULT_FORM_STATE, model: defaultModelForType(agentType) }
  );
  const initialSnapshot = useRef<AgentEditorFormState>(form);

  // Hydrate from agent when editing; template preset is only used for create mode
  useEffect(() => {
    if (!agent) {
      return;
    }

    const loaded = formStateFromAgent(agent);
    setForm(loaded);
    initialSnapshot.current = loaded;
  }, [agent]);

  const isDirty = !isFormEqual(form, initialSnapshot.current);

  // Field setters
  const setName = useCallback((value: string) => setForm((prev) => ({ ...prev, name: value })), []);
  const setDescription = useCallback((value: string) => setForm((prev) => ({ ...prev, description: value })), []);
  const setWorkspace = useCallback((value: string) => setForm((prev) => ({ ...prev, workspace: value })), []);
  const setPersona = useCallback((value: string) => setForm((prev) => ({ ...prev, persona: value })), []);
  const setModel = useCallback((value: string) => setForm((prev) => ({ ...prev, model: value })), []);
  const setEffort = useCallback(
    (value: ReasoningEffort | undefined) => setForm((prev) => ({ ...prev, effort: value })),
    []
  );
  const setThinkingConfig = useCallback(
    (value: AgentThinkingConfig | undefined) => setForm((prev) => ({ ...prev, thinkingConfig: value })),
    []
  );
  const setContextAutoCompactionEnabled = useCallback(
    (enabled: boolean) =>
      setForm((prev) => ({
        ...prev,
        contextAutoCompactionEnabled: enabled,
        contextAutoCompactionThreshold: enabled ? prev.contextAutoCompactionThreshold : undefined,
      })),
    []
  );
  const setContextAutoCompactionThreshold = useCallback(
    (value: number | undefined) => setForm((prev) => ({ ...prev, contextAutoCompactionThreshold: value })),
    []
  );
  const setAgentMd = useCallback((value: string) => setForm((prev) => ({ ...prev, agentMd: value })), []);

  const setPermissionMode = useCallback(
    (value: PermissionMode) => setForm((prev) => ({ ...prev, permissionMode: value })),
    []
  );

  const setSettingSources = useCallback(
    (updater: (prev: SettingSource[]) => SettingSource[]) =>
      setForm((prev) => ({ ...prev, settingSources: updater(prev.settingSources) })),
    []
  );

  const setDisableFileHooks = useCallback(
    (value: boolean) => setForm((prev) => ({ ...prev, disableFileHooks: value })),
    []
  );

  const setDisabledInstructionSources = useCallback(
    (disabledInstructionSources: string[]) => setForm((prev) => ({ ...prev, disabledInstructionSources })),
    []
  );

  const setDisabledSkills = useCallback(
    (disabledSkills: string[]) => setForm((prev) => ({ ...prev, disabledSkills })),
    []
  );

  const setToolMode = useCallback(
    (value: ToolMode) =>
      setForm((prev) => {
        if (value === TOOL_MODE.RESTRICTED) {
          // Pre-select builtin tools that are already auto-approved
          const builtinToolSet = BUILTIN_TOOL_SET_BY_TYPE[agentType];
          const selectedTools = prev.autoApprovedTools.filter((tool) => builtinToolSet.has(tool));
          return { ...prev, toolMode: value, selectedTools };
        }

        return { ...prev, toolMode: value, selectedTools: [] };
      }),
    [agentType]
  );

  const toggleTool = useCallback(
    (tool: string) =>
      setForm((prev) => {
        const isRemoving = prev.selectedTools.includes(tool);
        const selectedTools = isRemoving
          ? prev.selectedTools.filter((selectedTool) => selectedTool !== tool)
          : [...prev.selectedTools, tool];
        const autoApprovedTools = isRemoving
          ? prev.autoApprovedTools.filter((approvedTool) => approvedTool !== tool)
          : prev.autoApprovedTools;

        return { ...prev, selectedTools, autoApprovedTools };
      }),
    []
  );

  /** Replace both permission arrays at once — used to commit the permissions dialog's result. */
  const setPermissions = useCallback(
    (autoApprovedTools: string[], disallowedTools: string[]) =>
      setForm((prev) => ({ ...prev, autoApprovedTools, disallowedTools })),
    []
  );

  // MCP server selection
  const toggleMcpServer = useCallback(
    (serverId: string) =>
      setForm((prev) => ({
        ...prev,
        mcpServerIds: prev.mcpServerIds.includes(serverId)
          ? prev.mcpServerIds.filter((id) => id !== serverId)
          : [...prev.mcpServerIds, serverId],
      })),
    []
  );

  // Sensor selection
  const toggleSensor = useCallback(
    (sensorId: string) =>
      setForm((prev) => ({
        ...prev,
        sensorIds: prev.sensorIds.includes(sensorId)
          ? prev.sensorIds.filter((existingId) => existingId !== sensorId)
          : [...prev.sensorIds, sensorId],
      })),
    []
  );

  // Feed selection
  const toggleFeed = useCallback(
    (feedId: string) =>
      setForm((prev) => ({
        ...prev,
        configuredFeeds: prev.configuredFeeds.some((entry) => entry.feedId === feedId)
          ? prev.configuredFeeds.filter((entry) => entry.feedId !== feedId)
          : [...prev.configuredFeeds, { feedId }],
      })),
    []
  );

  const toggleFeedNotify = useCallback(
    (feedId: string) =>
      setForm((prev) => ({
        ...prev,
        configuredFeeds: prev.configuredFeeds.map((entry) =>
          entry.feedId === feedId ? { ...entry, isNotify: !entry.isNotify } : entry
        ),
      })),
    []
  );

  // Discord setters
  const setDiscordEnabled = useCallback(
    (value: boolean) => setForm((prev) => ({ ...prev, discordEnabled: value })),
    []
  );
  const setDiscordBotToken = useCallback(
    (value: string) => setForm((prev) => ({ ...prev, discordBotToken: value })),
    []
  );
  const addDiscordChannelId = useCallback(
    (channelId: string) =>
      setForm((prev) => {
        if (!channelId || prev.discordChannelIds.includes(channelId)) {
          return prev;
        }

        return { ...prev, discordChannelIds: [...prev.discordChannelIds, channelId] };
      }),
    []
  );
  const removeDiscordChannelId = useCallback(
    (channelId: string) =>
      setForm((prev) => ({
        ...prev,
        discordChannelIds: prev.discordChannelIds.filter((id) => id !== channelId),
      })),
    []
  );
  const addDiscordAllowedUserId = useCallback(
    (userId: string) =>
      setForm((prev) => {
        if (!userId || prev.discordAllowedUserIds.includes(userId)) {
          return prev;
        }

        return { ...prev, discordAllowedUserIds: [...prev.discordAllowedUserIds, userId] };
      }),
    []
  );
  const removeDiscordAllowedUserId = useCallback(
    (userId: string) =>
      setForm((prev) => ({
        ...prev,
        discordAllowedUserIds: prev.discordAllowedUserIds.filter((id) => id !== userId),
      })),
    []
  );
  const setDiscordRespondToMentionsOnly = useCallback(
    (value: boolean) => setForm((prev) => ({ ...prev, discordRespondToMentionsOnly: value })),
    []
  );
  const setDiscordSyncBotName = useCallback(
    (value: boolean) => setForm((prev) => ({ ...prev, discordSyncBotName: value })),
    []
  );

  const setExcludeClaudeCodeSystemPrompt = useCallback(
    (value: boolean) => setForm((prev) => ({ ...prev, excludeClaudeCodeSystemPrompt: value })),
    []
  );

  const setEnableGmailNotification = useCallback(
    (value: boolean) => setForm((prev) => ({ ...prev, enableGmailNotification: value })),
    []
  );

  const setVoiceConfigEnabled = useCallback(
    (enabled: boolean) =>
      setForm((prev) => ({
        ...prev,
        voiceConfigEnabled: enabled,
        voiceName: enabled ? prev.voiceName : "",
        voiceStylePrompt: enabled ? prev.voiceStylePrompt : "",
      })),
    []
  );
  const setVoiceName = useCallback((value: string) => setForm((prev) => ({ ...prev, voiceName: value })), []);
  const setVoiceStylePrompt = useCallback(
    (value: string) => setForm((prev) => ({ ...prev, voiceStylePrompt: value })),
    []
  );

  return {
    form,
    isDirty,
    setName,
    setDescription,
    setWorkspace,
    setPersona,
    setModel,
    setEffort,
    setThinkingConfig,
    setContextAutoCompactionEnabled,
    setContextAutoCompactionThreshold,
    setAgentMd,
    setPermissionMode,
    setSettingSources,
    setDisableFileHooks,
    setDisabledInstructionSources,
    setDisabledSkills,
    setToolMode,
    toggleTool,
    setPermissions,
    toggleMcpServer,
    toggleSensor,
    toggleFeed,
    toggleFeedNotify,
    setDiscordEnabled,
    setDiscordBotToken,
    addDiscordChannelId,
    removeDiscordChannelId,
    addDiscordAllowedUserId,
    removeDiscordAllowedUserId,
    setDiscordRespondToMentionsOnly,
    setDiscordSyncBotName,
    setExcludeClaudeCodeSystemPrompt,
    setEnableGmailNotification,
    setVoiceConfigEnabled,
    setVoiceName,
    setVoiceStylePrompt,
  };
}
