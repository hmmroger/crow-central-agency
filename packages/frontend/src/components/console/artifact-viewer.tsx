import { X } from "lucide-react";
import { useArtifactContentQuery } from "../../hooks/use-artifact-content-query.js";
import { MarkdownRenderer } from "../common/markdown-renderer.js";

interface ArtifactViewerProps {
  agentId: string;
  filename: string;
  onClose: () => void;
}

/**
 * View artifact file content in a slide-over panel.
 */
export function ArtifactViewer({ agentId, filename, onClose }: ArtifactViewerProps) {
  const { data, isLoading: loading } = useArtifactContentQuery(agentId, filename);
  const content = data?.content;

  return (
    <div className="flex flex-col h-full border-l border-border-subtle bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <span className="text-sm font-mono text-text-secondary truncate">{filename}</span>
        <button
          type="button"
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {loading ? (
          <span className="text-sm text-text-muted">Loading...</span>
        ) : filename.endsWith(".md") ? (
          <MarkdownRenderer content={content ?? ""} />
        ) : (
          <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap">{content}</pre>
        )}
      </div>
    </div>
  );
}
