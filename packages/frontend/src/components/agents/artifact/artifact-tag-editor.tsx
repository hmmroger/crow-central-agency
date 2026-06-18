import { useCallback } from "react";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { useUpdateArtifactTags } from "../../../hooks/queries/use-artifact-mutations.js";
import { TagCombobox } from "./tag-combobox.js";

interface ArtifactTagEditorProps {
  artifact: ArtifactMetadata;
  availableTags: string[];
  onUpdated: () => void;
}

/**
 * Editable tag control for an owned artifact. Toggling a tag adds it when absent or removes
 * it when present, applying the delta via the tag-update mutation and refreshing on success.
 */
export function ArtifactTagEditor({ artifact, availableTags, onUpdated }: ArtifactTagEditorProps) {
  const updateTags = useUpdateArtifactTags();
  const selectedTags = artifact.tags ?? [];

  const handleToggle = useCallback(
    (tag: string) => {
      const isPresent = (artifact.tags ?? []).includes(tag);
      const update = isPresent ? { removeTags: [tag] } : { addTags: [tag] };
      updateTags.mutate({ artifact, ...update }, { onSuccess: onUpdated });
    },
    [artifact, updateTags, onUpdated]
  );

  return (
    <div className="space-y-1">
      <TagCombobox
        allowCreate
        availableTags={availableTags}
        selectedTags={selectedTags}
        onToggle={handleToggle}
        placeholder="Add or create tags..."
      />
      {updateTags.isError && <p className="text-xs text-error">{updateTags.error.message}</p>}
    </div>
  );
}
