import { useCallback, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { ENTITY_TYPE } from "@crow-central-agency/shared";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { deleteAgentArtifact, deleteCircleArtifact, unwrapResponse } from "../../../services/api-client.js";
import { useConfirmDialog } from "../../../hooks/dialogs/use-confirm-dialog.js";
import { useOpenArtifactViewer } from "./use-open-artifact-viewer.js";
import { ArtifactItem } from "./artifact-item.js";
import { ArtifactTagFilter } from "./artifact-tag-filter.js";
import { ArtifactViewer } from "./artifact-viewer.js";

interface ArtifactPanelProps {
  artifacts: ArtifactMetadata[];
  loading: boolean;
  isError: boolean;
  onRefresh: () => void;
  onAdd?: () => void;
  label: string;
}

/**
 * Browse a list of artifacts. Shows file list with click to view content.
 */
export function ArtifactPanel({ artifacts, loading, isError, onRefresh, onAdd, label }: ArtifactPanelProps) {
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactMetadata | undefined>(undefined);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handleRefresh = useCallback(() => {
    onRefresh();
  }, [onRefresh]);

  const confirm = useConfirmDialog();
  const openArtifactViewer = useOpenArtifactViewer();

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const artifact of artifacts) {
      for (const tag of artifact.tags ?? []) {
        tagSet.add(tag);
      }
    }

    return [...tagSet].sort();
  }, [artifacts]);

  // Ignore any selected tag no longer present in the list (e.g. after a refetch)
  const activeTags = useMemo(() => selectedTags.filter((tag) => allTags.includes(tag)), [selectedTags, allTags]);

  const filteredArtifacts = useMemo(() => {
    if (activeTags.length === 0) {
      return artifacts;
    }

    return artifacts.filter((artifact) => activeTags.every((tag) => artifact.tags?.includes(tag)));
  }, [artifacts, activeTags]);

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]
    );
  }, []);

  const handleClearTags = useCallback(() => {
    setSelectedTags([]);
  }, []);

  const handleDelete = useCallback(
    (artifact: ArtifactMetadata) => {
      confirm({
        title: "Delete Artifact",
        message: `Are you sure you want to delete "${artifact.filename}"?`,
        confirmLabel: "Delete",
        destructive: true,
        onConfirm: async () => {
          const isCircle = artifact.entityType === ENTITY_TYPE.AGENT_CIRCLE;
          const response = isCircle
            ? await deleteCircleArtifact(artifact.entityId, artifact.filename)
            : await deleteAgentArtifact(artifact.entityId, artifact.filename);

          unwrapResponse(response);
          onRefresh();
        },
      });
    },
    [confirm, onRefresh]
  );

  if (selectedArtifact) {
    return (
      <ArtifactViewer
        entityType={selectedArtifact.entityType}
        entityId={selectedArtifact.entityId}
        filename={selectedArtifact.filename}
        tags={selectedArtifact.tags}
        onClose={() => setSelectedArtifact(undefined)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full border-l border-border-subtle bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <span className="text-sm font-medium text-text-neutral">{label}</span>
        <div className="flex items-center gap-0.5">
          {onAdd && (
            <button
              type="button"
              className="p-1 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors"
              onClick={onAdd}
              title="Add artifact"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            className="p-1 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors"
            onClick={handleRefresh}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tag filter — only shown when the list carries tags */}
      {allTags.length > 0 && (
        <div className="px-3 py-2 border-b border-border-subtle">
          <ArtifactTagFilter
            allTags={allTags}
            selectedTags={activeTags}
            onToggle={handleToggleTag}
            onClear={handleClearTags}
          />
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-3 text-xs text-text-muted">Loading...</div>}

        {!loading && isError && (
          <div className="p-3 text-xs text-error">Failed to load artifacts. Use the refresh button to retry.</div>
        )}

        {!loading && !isError && artifacts.length === 0 && (
          <div className="p-3 text-xs text-text-muted italic">No artifacts</div>
        )}

        {!loading && !isError && artifacts.length > 0 && filteredArtifacts.length === 0 && (
          <div className="p-3 text-xs text-text-muted italic">No artifacts match the selected tags.</div>
        )}

        {filteredArtifacts.map((artifact) => (
          <ArtifactItem
            key={`${artifact.entityId}/${artifact.filename}`}
            artifact={artifact}
            onClick={() => setSelectedArtifact(artifact)}
            onExpand={openArtifactViewer}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
