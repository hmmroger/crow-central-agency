import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiClient } from "../../services/api-client.js";

interface ArtifactViewerProps {
  agentId: string;
  filename: string;
  onClose: () => void;
}

/**
 * View artifact file content in a slide-over panel.
 */
export function ArtifactViewer({ agentId, filename, onClose }: ArtifactViewerProps) {
  const [content, setContent] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);

      try {
        const response = await apiClient.get<{ filename: string; content: string }>(
          `/agents/${agentId}/artifacts/${encodeURIComponent(filename)}`
        );

        if (response.success) {
          setContent(response.data.content);
        }
      } catch {
        setContent("Failed to load artifact content");
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [agentId, filename]);

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
        ) : (
          <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap">{content}</pre>
        )}
      </div>
    </div>
  );
}
