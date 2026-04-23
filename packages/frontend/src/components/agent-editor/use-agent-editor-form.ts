import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MODEL,
  DEFAULT_SETTING_SOURCES,
  PERMISSION_MODE,
  TOOL_MODE,
  TIME_MODE,
  type AgentConfigTemplate,
  type ConfiguredFeed,
  type DayOfWeek,
  type SchedulerTime,
  type PermissionMode,
  type SettingSource,
  type TimeModeType,
  type ToolMode,
} from "@crow-central-agency/shared";
import type { AgentDetailData, AgentEditorFormState } from "./agent-editor.types.js";
import { BUILTIN_TOOL_SET } from "./tool-constants.js";
import { arraysEqual } from "../../utils/array-utils.js";

/** Default form state for a new agent */
const DEFAULT_FORM_STATE: AgentEditorFormState = {
  name: "",
  description: "",
  workspace: "",
  persona: "",
  model: DEFAULT_MODEL,
  permissionMode: PERMISSION_MODE.DEFAULT,
  settingSources: [...DEFAULT_SETTING_SOURCES],
  toolMode: TOOL_MODE.UNRESTRICTED,
  selectedTools: [],
  autoApprovedTools: [],
  disallowedTools: [],
  disallowedToolsEnabled: false,
  availableTools: [],
  mcpServerIds: [],
  sensorIds: [],
  configuredFeeds: [],
  loopEnabled: false,
  loopDays: [],
  loopTimeMode: TIME_MODE.EVERY,
  loopTimes: [{}],
  loopPrompt: "",
  discordEnabled: false,
  discordBotToken: "",
  discordChannelIds: [],
  discordAllowedUserIds: [],
  discordRespondToMentionsOnly: false,
  discordSyncBotName: false,
  excludeClaudeCodeSystemPrompt: false,
  agentMd: "",
};

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
    permissionMode: template.permissionMode,
    settingSources: template.settingSources,
    toolMode: template.toolConfig.mode,
    selectedTools: template.toolConfig.tools ?? [],
    autoApprovedTools: template.toolConfig.autoApprovedTools ?? [],
    disallowedTools: template.toolConfig.disallowedTools ?? [],
    disallowedToolsEnabled: (template.toolConfig.disallowedTools ?? []).length > 0,
    availableTools: template.availableTools ?? [],
    mcpServerIds: template.mcpServerIds ?? [],
    sensorIds: template.sensorIds ?? [],
    configuredFeeds: template.configuredFeeds ?? [],
    loopEnabled: template.loop?.enabled ?? false,
    loopDays: template.loop?.daysOfWeek ?? [],
    loopTimeMode: template.loop?.timeMode ?? TIME_MODE.EVERY,
    loopTimes: template.loop?.times ?? [{}],
    loopPrompt: template.loop?.prompt ?? "",
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
    permissionMode: agent.permissionMode,
    settingSources: agent.settingSources,
    toolMode: agent.toolConfig.mode,
    selectedTools: agent.toolConfig.tools ?? [],
    autoApprovedTools: agent.toolConfig.autoApprovedTools ?? [],
    disallowedTools: agent.toolConfig.disallowedTools ?? [],
    disallowedToolsEnabled: (agent.toolConfig.disallowedTools ?? []).length > 0,
    availableTools: agent.availableTools ?? [],
    mcpServerIds: agent.mcpServerIds ?? [],
    sensorIds: agent.sensorIds ?? [],
    configuredFeeds: agent.configuredFeeds ?? [],
    loopEnabled: agent.loop?.enabled ?? false,
    loopDays: agent.loop?.daysOfWeek ?? [],
    loopTimeMode: agent.loop?.timeMode ?? TIME_MODE.EVERY,
    loopTimes: agent.loop?.times ?? [{}],
    loopPrompt: agent.loop?.prompt ?? "",
    discordEnabled: agent.discordConfig?.enabled ?? false,
    discordBotToken: agent.discordConfig?.botToken ?? "",
    discordChannelIds: agent.discordConfig?.channelIds ?? [],
    discordAllowedUserIds: agent.discordConfig?.allowedUserIds ?? [],
    discordRespondToMentionsOnly: agent.discordConfig?.respondToMentionsOnly ?? false,
    discordSyncBotName: agent.discordConfig?.syncBotName ?? false,
    excludeClaudeCodeSystemPrompt: agent.excludeClaudeCodeSystemPrompt ?? false,
    agentMd: agent.agentMd ?? "",
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
    formA.permissionMode === formB.permissionMode &&
    formA.toolMode === formB.toolMode &&
    formA.loopEnabled === formB.loopEnabled &&
    formA.loopTimeMode === formB.loopTimeMode &&
    loopTimesEqual(formA.loopTimes, formB.loopTimes) &&
    formA.loopPrompt === formB.loopPrompt &&
    formA.agentMd === formB.agentMd &&
    arraysEqual(formA.settingSources, formB.settingSources) &&
    arraysEqual(formA.selectedTools, formB.selectedTools) &&
    arraysEqual(formA.autoApprovedTools, formB.autoApprovedTools) &&
    arraysEqual(formA.disallowedTools, formB.disallowedTools) &&
    arraysEqual(formA.availableTools, formB.availableTools) &&
    arraysEqual(formA.mcpServerIds, formB.mcpServerIds) &&
    arraysEqual(formA.sensorIds, formB.sensorIds) &&
    configuredFeedsEqual(formA.configuredFeeds, formB.configuredFeeds) &&
    arraysEqual(formA.loopDays, formB.loopDays) &&
    formA.discordEnabled === formB.discordEnabled &&
    formA.discordBotToken === formB.discordBotToken &&
    formA.discordRespondToMentionsOnly === formB.discordRespondToMentionsOnly &&
    formA.discordSyncBotName === formB.discordSyncBotName &&
    formA.excludeClaudeCodeSystemPrompt === formB.excludeClaudeCodeSystemPrompt &&
    arraysEqual(formA.discordChannelIds, formB.discordChannelIds) &&
    arraysEqual(formA.discordAllowedUserIds, formB.discordAllowedUserIds)
  );
}

/** Deep equality check for SchedulerTime arrays (order-sensitive) */
function loopTimesEqual(timesA: SchedulerTime[], timesB: SchedulerTime[]): boolean {
  if (timesA.length !== timesB.length) {
    return false;
  }

  return timesA.every((time, index) => time.hour === timesB[index].hour && time.minute === timesB[index].minute);
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
export function useAgentEditorForm(agent?: AgentDetailData, templatePreset?: AgentConfigTemplate) {
  const [form, setForm] = useState<AgentEditorFormState>(() =>
    templatePreset ? formStateFromTemplate(templatePreset) : DEFAULT_FORM_STATE
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

  const setToolMode = useCallback(
    (value: ToolMode) =>
      setForm((prev) => {
        if (value === TOOL_MODE.RESTRICTED) {
          // Pre-select builtin tools that are already auto-approved
          const selectedTools = prev.autoApprovedTools.filter((tool) => BUILTIN_TOOL_SET.has(tool));
          return { ...prev, toolMode: value, selectedTools };
        }

        return { ...prev, toolMode: value, selectedTools: [] };
      }),
    []
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

  const toggleAutoApproved = useCallback(
    (tool: string) =>
      setForm((prev) => ({
        ...prev,
        autoApprovedTools: prev.autoApprovedTools.includes(tool)
          ? prev.autoApprovedTools.filter((approvedTool) => approvedTool !== tool)
          : [...prev.autoApprovedTools, tool],
      })),
    []
  );

  const addCustomAutoApproved = useCallback(
    (toolName: string) =>
      setForm((prev) => {
        if (!toolName || prev.autoApprovedTools.includes(toolName)) {
          return prev;
        }

        return { ...prev, autoApprovedTools: [...prev.autoApprovedTools, toolName] };
      }),
    []
  );

  // Disallowed tools
  const setDisallowedToolsEnabled = useCallback(
    (enabled: boolean) =>
      setForm((prev) => ({
        ...prev,
        disallowedToolsEnabled: enabled,
        disallowedTools: enabled ? prev.disallowedTools : [],
      })),
    []
  );

  const toggleDisallowedTool = useCallback(
    (tool: string) =>
      setForm((prev) => ({
        ...prev,
        disallowedTools: prev.disallowedTools.includes(tool)
          ? prev.disallowedTools.filter((disallowed) => disallowed !== tool)
          : [...prev.disallowedTools, tool],
      })),
    []
  );

  const addCustomDisallowedTool = useCallback(
    (toolName: string) =>
      setForm((prev) => {
        if (!toolName || prev.disallowedTools.includes(toolName)) {
          return prev;
        }

        return { ...prev, disallowedTools: [...prev.disallowedTools, toolName] };
      }),
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

  // Loop setters
  const setLoopEnabled = useCallback((value: boolean) => setForm((prev) => ({ ...prev, loopEnabled: value })), []);
  const setLoopDays = useCallback((value: DayOfWeek[]) => setForm((prev) => ({ ...prev, loopDays: value })), []);
  const setLoopTimeMode = useCallback(
    (value: TimeModeType) =>
      setForm((prev) => ({
        ...prev,
        loopTimeMode: value,
        // EVERY only uses the first entry; trim excess when switching modes
        loopTimes: value === TIME_MODE.EVERY ? [prev.loopTimes[0] ?? {}] : prev.loopTimes,
      })),
    []
  );
  const setLoopTimes = useCallback(
    (updater: (prev: SchedulerTime[]) => SchedulerTime[]) =>
      setForm((prev) => ({ ...prev, loopTimes: updater(prev.loopTimes) })),
    []
  );
  const setLoopPrompt = useCallback((value: string) => setForm((prev) => ({ ...prev, loopPrompt: value })), []);

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

  return {
    form,
    isDirty,
    setName,
    setDescription,
    setWorkspace,
    setPersona,
    setModel,
    setAgentMd,
    setPermissionMode,
    setSettingSources,
    setToolMode,
    toggleTool,
    toggleAutoApproved,
    addCustomAutoApproved,
    setDisallowedToolsEnabled,
    toggleDisallowedTool,
    addCustomDisallowedTool,
    toggleMcpServer,
    toggleSensor,
    toggleFeed,
    toggleFeedNotify,
    setLoopEnabled,
    setLoopDays,
    setLoopTimeMode,
    setLoopTimes,
    setLoopPrompt,
    setDiscordEnabled,
    setDiscordBotToken,
    addDiscordChannelId,
    removeDiscordChannelId,
    addDiscordAllowedUserId,
    removeDiscordAllowedUserId,
    setDiscordRespondToMentionsOnly,
    setDiscordSyncBotName,
    setExcludeClaudeCodeSystemPrompt,
  };
}
