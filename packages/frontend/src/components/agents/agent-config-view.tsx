import { useCallback, useEffect, useState } from "react";
import {
  PERMISSION_MODE,
  TOOL_MODE,
  DEFAULT_MODEL,
  type AgentConfig,
  type CreateAgentInput,
  type UpdateAgentInput,
  type PermissionMode,
  type ToolMode,
} from "@crow-central-agency/shared";
import { apiClient } from "../../services/api-client.js";
import { useAppStore } from "../../stores/app-store.js";

interface AgentConfigViewProps {
  agentId?: string;
}

/**
 * Full view for creating or editing an agent.
 * Navigated to via view-state, not a modal.
 */
export function AgentConfigView({ agentId }: AgentConfigViewProps) {
  const goToDashboard = useAppStore((state) => state.goToDashboard);
  const isEditing = agentId !== undefined;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [persona, setPersona] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(PERMISSION_MODE.DEFAULT);
  const [toolMode, setToolMode] = useState<ToolMode>(TOOL_MODE.UNRESTRICTED);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [autoApprovedTools, setAutoApprovedTools] = useState<string[]>([]);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingAgent, setLoadingAgent] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Load existing agent config when editing
  useEffect(() => {
    if (!agentId) {
      return;
    }

    const loadAgent = async () => {
      setLoadingAgent(true);

      try {
        const response = await apiClient.get<AgentConfig>(`/agents/${agentId}`);

        if (response.success) {
          const agent = response.data;
          setName(agent.name);
          setDescription(agent.description);
          setWorkspace(agent.workspace);
          setPersona(agent.persona);
          setModel(agent.model);
          setPermissionMode(agent.permissionMode);
          setToolMode(agent.toolConfig.mode);
          setSelectedTools(agent.toolConfig.tools ?? []);
          setAutoApprovedTools(agent.toolConfig.autoApprovedTools ?? []);
          setAvailableTools(agent.availableTools ?? []);
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
      if (isEditing) {
        const input: UpdateAgentInput = {
          name,
          description,
          workspace,
          persona,
          model,
          permissionMode,
          toolConfig: {
            mode: toolMode,
            tools: toolMode === TOOL_MODE.RESTRICTED ? selectedTools : undefined,
            autoApprovedTools: autoApprovedTools.length > 0 ? autoApprovedTools : undefined,
          },
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
          toolConfig: {
            mode: toolMode,
            tools: toolMode === TOOL_MODE.RESTRICTED ? selectedTools : undefined,
            autoApprovedTools: autoApprovedTools.length > 0 ? autoApprovedTools : undefined,
          },
        };

        const response = await apiClient.post("/agents", input);

        if (!response.success) {
          setError(response.error.message);

          return;
        }
      }

      goToDashboard();
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
    selectedTools,
    autoApprovedTools,
    goToDashboard,
  ]);

  /** Change tool mode and clear auto-approved tools to prevent stale entries */
  const handleToolModeChange = useCallback((mode: ToolMode) => {
    setToolMode(mode);
    setAutoApprovedTools([]);
  }, []);

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

  /** The source of tools for auto-approved selection depends on tool mode */
  const autoApprovedSource = toolMode === TOOL_MODE.RESTRICTED ? selectedTools : availableTools;

  if (loadingAgent) {
    return <div className="h-full flex items-center justify-center text-text-muted">Loading agent...</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-semibold text-text-primary">{isEditing ? "Edit Agent" : "Create Agent"}</h2>
          <button
            type="button"
            className="px-3 py-1.5 rounded-md text-sm text-text-muted hover:text-text-primary transition-colors"
            onClick={goToDashboard}
          >
            Cancel
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 rounded-md bg-error/10 border border-error/20 text-error text-sm">{error}</div>
        )}

        <div className="space-y-6">
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
          <FieldGroup label="Persona">
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
          {autoApprovedSource.length > 0 && (
            <FieldGroup label="Auto-Approved Tools">
              <p className="text-xs text-text-muted mb-2">These tools skip the permission dialog.</p>
              <div className="flex flex-wrap gap-1.5">
                {autoApprovedSource.map((tool) => (
                  <ChipButton
                    key={tool}
                    label={tool}
                    active={autoApprovedTools.includes(tool)}
                    onClick={() => toggleAutoApproved(tool)}
                  />
                ))}
              </div>
            </FieldGroup>
          )}

          {/* Save */}
          <div className="pt-4 border-t border-border-subtle">
            <button
              type="button"
              className="px-4 py-2 rounded-md bg-primary text-text-primary font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              onClick={handleSave}
              disabled={saving || !name.trim() || !workspace.trim()}
            >
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Agent"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Field group with label */
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-secondary mb-1.5">{label}</label>
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
