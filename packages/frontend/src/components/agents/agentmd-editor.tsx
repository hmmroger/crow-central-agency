import { useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { MarkdownRenderer } from "../common/markdown-renderer.js";

interface AgentMdEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Markdown editor with edit/preview toggle for AGENT.md content.
 * Pure controlled component — parent owns the state and save logic.
 */
export function AgentMdEditor({ value, onChange }: AgentMdEditorProps) {
  const [previewing, setPreviewing] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">Persistent instructions loaded into every query.</p>
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
        </div>
      </div>

      {previewing ? (
        <div className="min-h-48 px-3 py-2 rounded-md bg-surface-inset border border-border-subtle overflow-y-auto">
          {value ? (
            <MarkdownRenderer content={value} />
          ) : (
            <span className="text-xs text-text-muted italic">Nothing to preview</span>
          )}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="# Agent Instructions&#10;&#10;Write persistent instructions here..."
          rows={8}
          className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
        />
      )}
    </div>
  );
}
