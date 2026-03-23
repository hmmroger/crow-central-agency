import { useCallback, useEffect, useState } from "react";
import { Eye, Pencil, Save } from "lucide-react";
import { apiClient } from "../../services/api-client.js";
import { MarkdownRenderer } from "../common/markdown-renderer.js";

interface AgentMdEditorProps {
  agentId: string;
}

/**
 * Markdown editor for the agent's AGENT.md persistent instructions file.
 * Loads content from REST, saves on button click. Has edit/preview toggle.
 */
export function AgentMdEditor({ agentId }: AgentMdEditorProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);

      try {
        const response = await apiClient.get<{ content: string }>(`/agents/${agentId}/agent-md`);

        if (response.success) {
          setContent(response.data.content ?? "");
        }
      } catch {
        // Non-fatal — start with empty content
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [agentId]);

  const handleSave = useCallback(async () => {
    setSaving(true);

    try {
      await apiClient.put(`/agents/${agentId}/agent-md`, { content });
      setDirty(false);
    } catch {
      // Error handling in future
    } finally {
      setSaving(false);
    }
  }, [agentId, content]);

  if (loading) {
    return <div className="text-xs text-text-muted p-2">Loading AGENT.md...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">AGENT.md — persistent instructions</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              previewing
                ? "text-text-muted hover:text-text-primary hover:bg-surface-elevated"
                : "text-primary bg-primary/10"
            }`}
            onClick={() => setPreviewing(false)}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              previewing
                ? "text-primary bg-primary/10"
                : "text-text-muted hover:text-text-primary hover:bg-surface-elevated"
            }`}
            onClick={() => setPreviewing(true)}
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-30"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {previewing ? (
        <div className="min-h-[12rem] px-3 py-2 rounded-md bg-surface-inset border border-border-subtle overflow-y-auto">
          {content ? (
            <MarkdownRenderer content={content} />
          ) : (
            <span className="text-xs text-text-muted italic">Nothing to preview</span>
          )}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setDirty(true);
          }}
          placeholder="# Agent Instructions&#10;&#10;Write persistent instructions here..."
          rows={8}
          className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
        />
      )}
    </div>
  );
}
