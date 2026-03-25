import { useCallback, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { useAgentArtifactsQuery } from "../../hooks/use-agent-artifacts-query.js";
import { ArtifactViewer } from "./artifact-viewer.js";

interface ArtifactPanelProps {
  agentId: string;
}

/**
 * Browse artifacts for an agent. Shows file list with click to view content.
 */
export function ArtifactPanel({ agentId }: ArtifactPanelProps) {
  const { data: artifacts = [], isLoading: loading, isError, refetch } = useAgentArtifactsQuery(agentId);
  const handleRefetch = useCallback(() => {
    void refetch();
  }, [refetch]);
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined);

  if (selectedFile) {
    return <ArtifactViewer agentId={agentId} filename={selectedFile} onClose={() => setSelectedFile(undefined)} />;
  }

  return (
    <div className="flex flex-col h-full border-l border-border-subtle bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <span className="text-sm font-medium text-text-secondary">Artifacts</span>
        <button
          type="button"
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
          onClick={handleRefetch}
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-3 text-xs text-text-muted">Loading...</div>}

        {!loading && isError && <div className="p-3 text-xs text-error">Failed to load artifacts</div>}

        {!loading && !isError && artifacts.length === 0 && (
          <div className="p-3 text-xs text-text-muted italic">No artifacts</div>
        )}

        {artifacts.map((artifact) => (
          <button
            key={artifact.filename}
            type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-elevated transition-colors"
            onClick={() => setSelectedFile(artifact.filename)}
          >
            <FileText className="h-3 w-3 shrink-0 text-text-muted" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-secondary truncate">{artifact.filename}</div>
              <div className="text-xs text-text-muted">{formatSize(artifact.size)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Format file size for display */
function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
