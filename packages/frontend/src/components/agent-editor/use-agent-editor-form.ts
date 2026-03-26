import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MODEL,
  DEFAULT_SETTING_SOURCES,
  DEFAULT_AVAILABLE_TOOLS,
  PERMISSION_MODE,
  TOOL_MODE,
  TIME_MODE,
  type AgentConfig,
  type DayOfWeek,
  type PermissionMode,
  type SettingSource,
  type TimeMode,
  type ToolMode,
} from "@crow-central-agency/shared";
import type { AgentEditorFormState } from "./agent-editor.types.js";

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
  availableTools: [...DEFAULT_AVAILABLE_TOOLS],
  loopEnabled: false,
  loopDays: [],
  loopTimeMode: TIME_MODE.EVERY,
  loopHour: undefined,
  loopMinute: undefined,
  loopPrompt: "",
  agentMd: "",
};

/** Agent data as returned by the detail query (config + optional agentMd) */
export type AgentDetailData = AgentConfig & { agentMd?: string };

/** Build form state from an existing agent config */
function formStateFromAgent(agent: AgentDetailData): AgentEditorFormState {
  return {
    name: agent.name,
    description: agent.description,
    workspace: agent.workspace,
    persona: agent.persona,
    model: agent.model,
    permissionMode: agent.permissionMode,
    settingSources: agent.settingSources,
    toolMode: agent.toolConfig.mode,
    selectedTools: agent.toolConfig.tools ?? [],
    autoApprovedTools: agent.toolConfig.autoApprovedTools ?? [],
    availableTools: agent.availableTools ?? [...DEFAULT_AVAILABLE_TOOLS],
    loopEnabled: agent.loop.enabled,
    loopDays: agent.loop.daysOfWeek,
    loopTimeMode: agent.loop.timeMode,
    loopHour: agent.loop.hour,
    loopMinute: agent.loop.minute,
    loopPrompt: agent.loop.prompt,
    agentMd: agent.agentMd ?? "",
  };
}

/** Deep equality check for form state — compares all fields including arrays */
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
    formA.loopHour === formB.loopHour &&
    formA.loopMinute === formB.loopMinute &&
    formA.loopPrompt === formB.loopPrompt &&
    formA.agentMd === formB.agentMd &&
    arraysEqual(formA.settingSources, formB.settingSources) &&
    arraysEqual(formA.selectedTools, formB.selectedTools) &&
    arraysEqual(formA.autoApprovedTools, formB.autoApprovedTools) &&
    arraysEqual(formA.loopDays, formB.loopDays)
  );
}

/** Order-independent array equality for string/primitive arrays */
function arraysEqual<T>(arrayA: T[], arrayB: T[]): boolean {
  if (arrayA.length !== arrayB.length) {
    return false;
  }

  const sorted1 = [...arrayA].sort();
  const sorted2 = [...arrayB].sort();

  return sorted1.every((value, index) => value === sorted2[index]);
}

/**
 * Encapsulates all agent editor form state with dirty tracking.
 * Provides field values, setters, isDirty, and the current form snapshot.
 *
 * @param agent - Existing agent data (undefined for create mode)
 */
export function useAgentEditorForm(agent?: AgentDetailData) {
  const [form, setForm] = useState<AgentEditorFormState>(DEFAULT_FORM_STATE);
  const initialSnapshot = useRef<AgentEditorFormState>(DEFAULT_FORM_STATE);

  // Populate form when agent data arrives
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
      setForm((prev) => ({
        ...prev,
        toolMode: value,
        // Clear source-list-derived approvals when switching mode
        autoApprovedTools: prev.autoApprovedTools.filter((tool) => !prev.availableTools.includes(tool)),
      })),
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

  // Loop setters
  const setLoopEnabled = useCallback((value: boolean) => setForm((prev) => ({ ...prev, loopEnabled: value })), []);
  const setLoopDays = useCallback((value: DayOfWeek[]) => setForm((prev) => ({ ...prev, loopDays: value })), []);
  const setLoopTimeMode = useCallback((value: TimeMode) => setForm((prev) => ({ ...prev, loopTimeMode: value })), []);
  const setLoopHour = useCallback((value: number | undefined) => setForm((prev) => ({ ...prev, loopHour: value })), []);
  const setLoopMinute = useCallback(
    (value: number | undefined) => setForm((prev) => ({ ...prev, loopMinute: value })),
    []
  );
  const setLoopPrompt = useCallback((value: string) => setForm((prev) => ({ ...prev, loopPrompt: value })), []);

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
    setLoopEnabled,
    setLoopDays,
    setLoopTimeMode,
    setLoopHour,
    setLoopMinute,
    setLoopPrompt,
  };
}
