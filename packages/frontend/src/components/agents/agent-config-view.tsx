import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import {
  PERMISSION_MODE,
  SETTING_SOURCE,
  DEFAULT_SETTING_SOURCES,
  TOOL_MODE,
  TIME_MODE,
  DEFAULT_MODEL,
  DEFAULT_AVAILABLE_TOOLS,
  type AgentConfig,
  type CreateAgentInput,
  type UpdateAgentInput,
  type PermissionMode,
  type SettingSource,
  type ToolMode,
  type TimeMode,
  type DayOfWeek,
} from "@crow-central-agency/shared";
import { apiClient } from "../../services/api-client.js";
import { useAppStore } from "../../stores/app-store.js";
import { useHeader } from "../../hooks/use-header.js";
import { LoopConfigPanel } from "./loop-config-panel.js";
import { AgentMdEditor } from "./agentmd-editor.js";
import { GenerateModal } from "./generate-modal.js";

interface AgentConfigViewProps {
  agentId?: string;
}

/**
 * Full view for creating or editing an agent.
 * Navigated to via view-state, not a modal.
 */
export function AgentConfigView({ agentId }: AgentConfigViewProps) {
  const goBack = useAppStore((state) => state.goBack);
  const isEditing = agentId !== undefined;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [persona, setPersona] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(PERMISSION_MODE.DEFAULT);
  const [settingSources, setSettingSources] = useState<SettingSource[]>([...DEFAULT_SETTING_SOURCES]);
  const [toolMode, setToolMode] = useState<ToolMode>(TOOL_MODE.UNRESTRICTED);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [autoApprovedTools, setAutoApprovedTools] = useState<string[]>([]);
  const [availableTools, setAvailableTools] = useState<string[]>([...DEFAULT_AVAILABLE_TOOLS]);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopDays, setLoopDays] = useState<DayOfWeek[]>([]);
  const [loopTimeMode, setLoopTimeMode] = useState<TimeMode>(TIME_MODE.EVERY);
  const [loopHour, setLoopHour] = useState<number | undefined>(undefined);
  const [loopMinute, setLoopMinute] = useState<number | undefined>(undefined);
  const [loopPrompt, setLoopPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingAgent, setLoadingAgent] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [agentMd, setAgentMd] = useState("");
  const [customToolInput, setCustomToolInput] = useState("");
  const customToolInputRef = useRef<HTMLInputElement>(null);
  const [generateModalType, setGenerateModalType] = useState<"persona" | "agentmd" | undefined>(undefined);

  // Load existing agent config when editing
  useEffect(() => {
    if (!agentId) {
      return;
    }

    const loadAgent = async () => {
      setLoadingAgent(true);

      try {
        const response = await apiClient.get<AgentConfig & { agentMd?: string }>(`/agents/${agentId}`);

        if (response.success) {
          const agent = response.data;
          setName(agent.name);
          setDescription(agent.description);
          setWorkspace(agent.workspace);
          setPersona(agent.persona);
          setModel(agent.model);
          setPermissionMode(agent.permissionMode);
          setSettingSources(agent.settingSources);
          setToolMode(agent.toolConfig.mode);
          setSelectedTools(agent.toolConfig.tools ?? []);
          setAutoApprovedTools(agent.toolConfig.autoApprovedTools ?? []);
          setAvailableTools(agent.availableTools ?? [...DEFAULT_AVAILABLE_TOOLS]);
          setLoopEnabled(agent.loop.enabled);
          setLoopDays(agent.loop.daysOfWeek);
          setLoopTimeMode(agent.loop.timeMode);
          setLoopHour(agent.loop.hour);
          setLoopMinute(agent.loop.minute);
          setLoopPrompt(agent.loop.prompt);
          setAgentMd(agent.agentMd ?? "");
        } else {
          setError(response.error.message);
        }
      } catch {
        setError("Failed to load agent");
      } finally {
        setLoadingAgent(false);
      }
    };

    void loadAgent();
  }, [agentId]);

  /** Save — create or update */
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(undefined);

    try {
      const loopConfig = {
        enabled: loopEnabled,
        daysOfWeek: loopDays,
        timeMode: loopTimeMode,
        hour: loopHour,
        minute: loopMinute,
        prompt: loopPrompt,
      };

      if (isEditing) {
        const input: UpdateAgentInput = {
          name,
          description,
          workspace,
          persona,
          model,
          permissionMode,
          settingSources,
          toolConfig: {
            mode: toolMode,
            tools: toolMode === TOOL_MODE.RESTRICTED ? selectedTools : undefined,
            autoApprovedTools: autoApprovedTools.length > 0 ? autoApprovedTools : undefined,
          },
          loop: loopConfig,
          agentMd: agentMd.trim() || undefined,
        };

        const response = await apiClient.patch(`/agents/${agentId}`, input);

        if (!response.success) {
          setError(response.error.message);

          return;
        }
      } else {
        const input: CreateAgentInput = {
          name,
          workspace,
          description: description || undefined,
          persona: persona || undefined,
          model: model !== DEFAULT_MODEL ? model : undefined,
          permissionMode,
          settingSources,
          toolConfig: {
            mode: toolMode,
            tools: toolMode === TOOL_MODE.RESTRICTED ? selectedTools : undefined,
            autoApprovedTools: autoApprovedTools.length > 0 ? autoApprovedTools : undefined,
          },
          loop: loopConfig,
          agentMd: agentMd.trim() || undefined,
        };

        const response = await apiClient.post("/agents", input);

        if (!response.success) {
          setError(response.error.message);

          return;
        }
      }

      goBack();
    } catch {
      setError("Failed to save agent");
    } finally {
      setSaving(false);
    }
  }, [
    isEditing,
    agentId,
    name,
    description,
    workspace,
    persona,
    model,
    permissionMode,
    toolMode,
    settingSources,
    selectedTools,
    autoApprovedTools,
    loopEnabled,
    loopDays,
    loopTimeMode,
    loopHour,
    loopMinute,
    loopPrompt,
    agentMd,
    goBack,
  ]);

  /** Delete the agent and return to dashboard */
  const handleDelete = useCallback(async () => {
    if (!agentId) {
      return;
    }

    try {
      await apiClient.del(`/agents/${agentId}`);
      goBack();
    } catch {
      setError("Failed to delete agent");
    }
  }, [agentId, goBack]);

  // Register header content
  const { setTitle, setActions } = useHeader();

  setTitle(isEditing ? name || "Edit Agent" : "Create Agent");
  setActions(
    isEditing
      ? [
          { key: "delete", label: "Delete", icon: Trash2, onClick: handleDelete, isDestructive: true },
          {
            key: "save",
            label: saving ? "Saving..." : "Save",
            onClick: handleSave,
            isPrimary: true,
            disabled: saving || !name.trim() || !workspace.trim(),
          },
        ]
      : [
          {
            key: "create",
            label: saving ? "Creating..." : "Create",
            onClick: handleSave,
            isPrimary: true,
            disabled: saving || !name.trim() || !workspace.trim(),
          },
        ]
  );

  /** Change tool mode — preserve custom tools (MCP), clear source-list-derived approvals */
  const handleToolModeChange = useCallback(
    (mode: ToolMode) => {
      setToolMode(mode);
      setAutoApprovedTools((prev) => prev.filter((tool) => !availableTools.includes(tool)));
    },
    [availableTools]
  );

  /** Toggle a tool in the selected tools list. Also removes from auto-approved if deselected. */
  const toggleTool = useCallback((tool: string) => {
    setSelectedTools((prev) => {
      const isRemoving = prev.includes(tool);
      const next = isRemoving ? prev.filter((selectedTool) => selectedTool !== tool) : [...prev, tool];

      if (isRemoving) {
        setAutoApprovedTools((approved) => approved.filter((approvedTool) => approvedTool !== tool));
      }

      return next;
    });
  }, []);

  /** Toggle a tool in the auto-approved list */
  const toggleAutoApproved = useCallback((tool: string) => {
    setAutoApprovedTools((prev) =>
      prev.includes(tool) ? prev.filter((approvedTool) => approvedTool !== tool) : [...prev, tool]
    );
  }, []);

  /** Add a custom tool name to auto-approved list */
  const addCustomAutoApproved = useCallback(() => {
    const toolName = customToolInput.trim();

    if (!toolName || autoApprovedTools.includes(toolName)) {
      return;
    }

    setAutoApprovedTools((prev) => [...prev, toolName]);
    setCustomToolInput("");
    customToolInputRef.current?.focus();
  }, [customToolInput, autoApprovedTools]);

  /** The source of tools for auto-approved selection depends on tool mode */
  const autoApprovedSource = toolMode === TOOL_MODE.RESTRICTED ? selectedTools : availableTools;

  /** Custom tools added by user that aren't in the standard source list */
  const customOnlyTools = autoApprovedTools.filter((tool) => !autoApprovedSource.includes(tool));

  if (loadingAgent) {
    return <div className="h-full flex items-center justify-center text-text-muted">Loading agent...</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-10/12 mx-auto p-6">
        {/* Error */}
        {error && (
          <div className="mb-6 p-3 rounded-md bg-error/10 border border-error/20 text-error text-sm">{error}</div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left column — settings */}
          <div className="flex flex-col flex-1 min-w-0 space-y-6">
            {/* Name */}
            <FieldGroup label="Name">
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Agent name"
                maxLength={50}
                className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
              />
            </FieldGroup>

            {/* Description */}
            <FieldGroup label="Description">
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What does this agent do?"
                className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
              />
            </FieldGroup>

            {/* Workspace */}
            <FieldGroup label="Workspace Path">
              <input
                type="text"
                value={workspace}
                onChange={(event) => setWorkspace(event.target.value)}
                placeholder="/path/to/workspace"
                className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
              />
            </FieldGroup>

            {/* Model */}
            <FieldGroup label="Model">
              <input
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder={DEFAULT_MODEL}
                className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
              />
            </FieldGroup>

            {/* Persona */}
            <FieldGroup
              label="Persona"
              action={
                <button
                  type="button"
                  className="text-text-muted hover:text-secondary transition-colors"
                  onClick={() => setGenerateModalType("persona")}
                  title="Generate with AI"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </button>
              }
            >
              <textarea
                value={persona}
                onChange={(event) => setPersona(event.target.value)}
                placeholder="System-level instructions that shape agent behavior..."
                rows={4}
                className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
              />
            </FieldGroup>

            {/* Permission Mode */}
            <FieldGroup label="Permission Mode">
              <select
                value={permissionMode}
                onChange={(event) => setPermissionMode(event.target.value as PermissionMode)}
                className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-border-focus"
              >
                <option value={PERMISSION_MODE.DEFAULT}>Default</option>
                <option value={PERMISSION_MODE.ACCEPT_EDITS}>Accept Edits</option>
                <option value={PERMISSION_MODE.PLAN}>Plan</option>
                <option value={PERMISSION_MODE.DONT_ASK}>Don&apos;t Ask</option>
                <option value={PERMISSION_MODE.BYPASS_PERMISSIONS}>Bypass Permissions</option>
              </select>
            </FieldGroup>

            {/* Setting Sources */}
            <FieldGroup label="Setting Sources">
              <p className="text-xs text-text-muted mb-2">SDK configuration sources included in queries.</p>
              <div className="flex gap-3">
                {([SETTING_SOURCE.USER, SETTING_SOURCE.PROJECT, SETTING_SOURCE.LOCAL] as const).map((source) => (
                  <label key={source} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingSources.includes(source)}
                      onChange={() => {
                        setSettingSources((prev) =>
                          prev.includes(source)
                            ? prev.filter((existingSource) => existingSource !== source)
                            : [...prev, source]
                        );
                      }}
                      className="rounded border-border-subtle bg-surface-inset text-primary focus:ring-primary/30"
                    />
                    <span className="text-xs text-text-secondary capitalize">{source}</span>
                  </label>
                ))}
              </div>
            </FieldGroup>

            {/* Tool Mode */}
            <FieldGroup label="Tools">
              <div className="flex gap-2 mb-3">
                <ToggleButton
                  active={toolMode === TOOL_MODE.UNRESTRICTED}
                  onClick={() => handleToolModeChange(TOOL_MODE.UNRESTRICTED)}
                  label="Unrestricted"
                />
                <ToggleButton
                  active={toolMode === TOOL_MODE.RESTRICTED}
                  onClick={() => handleToolModeChange(TOOL_MODE.RESTRICTED)}
                  label="Restricted"
                />
              </div>

              {toolMode === TOOL_MODE.RESTRICTED && availableTools.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {availableTools.map((tool) => (
                    <ChipButton
                      key={tool}
                      label={tool}
                      active={selectedTools.includes(tool)}
                      onClick={() => toggleTool(tool)}
                    />
                  ))}
                </div>
              )}

              {toolMode === TOOL_MODE.RESTRICTED && availableTools.length === 0 && (
                <p className="text-xs text-text-muted">
                  Available tools will be populated after the agent&apos;s first query.
                </p>
              )}
            </FieldGroup>

            {/* Auto-Approved Tools */}
            <FieldGroup label="Auto-Approved Tools">
              <p className="text-xs text-text-muted mb-2">These tools skip the permission dialog.</p>

              {autoApprovedSource.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {autoApprovedSource.map((tool) => (
                    <ChipButton
                      key={tool}
                      label={tool}
                      active={autoApprovedTools.includes(tool)}
                      onClick={() => toggleAutoApproved(tool)}
                    />
                  ))}
                </div>
              )}

              {/* Custom auto-approved tools not in the source list */}
              {customOnlyTools.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {customOnlyTools.map((tool) => (
                    <ChipButton key={tool} label={tool} active onClick={() => toggleAutoApproved(tool)} />
                  ))}
                </div>
              )}

              {/* Add custom tool input */}
              <div className="flex gap-2">
                <input
                  ref={customToolInputRef}
                  type="text"
                  value={customToolInput}
                  onChange={(event) => setCustomToolInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomAutoApproved();
                    }
                  }}
                  placeholder="Add custom tool (e.g. mcp__server__tool)"
                  className="flex-1 px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-xs font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
                />
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md bg-surface-elevated text-text-secondary text-xs font-medium hover:text-text-primary transition-colors disabled:opacity-50"
                  onClick={addCustomAutoApproved}
                  disabled={!customToolInput.trim()}
                >
                  Add
                </button>
              </div>
            </FieldGroup>

            {/* Loop Configuration */}
            <FieldGroup label="Loop Schedule">
              <LoopConfigPanel
                enabled={loopEnabled}
                daysOfWeek={loopDays}
                timeMode={loopTimeMode}
                hour={loopHour}
                minute={loopMinute}
                prompt={loopPrompt}
                onEnabledChange={setLoopEnabled}
                onDaysChange={setLoopDays}
                onTimeModeChange={setLoopTimeMode}
                onHourChange={setLoopHour}
                onMinuteChange={setLoopMinute}
                onPromptChange={setLoopPrompt}
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
            <div className="flex-1 max-h-1/2">
              <AgentMdEditor value={agentMd} onChange={setAgentMd} />
            </div>
          </div>
        </div>

        {/* Generate Modal */}
        {generateModalType && (
          <GenerateModal
            type={generateModalType}
            context={
              generateModalType === "agentmd"
                ? [description, persona].filter(Boolean).join("\n") || undefined
                : description || undefined
            }
            onApply={(content) => {
              if (generateModalType === "persona") {
                setPersona(content);
              } else {
                setAgentMd(content);
              }
            }}
            onClose={() => setGenerateModalType(undefined)}
          />
        )}
      </div>
    </div>
  );
}

/** Field group with label and optional action element */
function FieldGroup({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-text-secondary">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Toggle button for tool mode selection */
function ToggleButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  const activeClass = "bg-primary/20 text-primary border border-primary/30";
  const inactiveClass = "bg-surface-inset text-text-muted border border-border-subtle hover:text-text-secondary";

  return (
    <button
      type="button"
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${active ? activeClass : inactiveClass}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Chip button for tool selection */
function ChipButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const activeClass = "bg-primary/15 text-primary border border-primary/25";
  const inactiveClass = "bg-surface-inset text-text-muted border border-border-subtle hover:text-text-secondary";

  return (
    <button
      type="button"
      className={`px-2 py-1 rounded text-xs font-mono transition-colors ${active ? activeClass : inactiveClass}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
