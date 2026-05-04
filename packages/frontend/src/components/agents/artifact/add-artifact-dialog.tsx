import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { Upload } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { unwrapResponse, uploadArtifact, uploadCircleArtifact } from "../../../services/api-client.js";
import { useAgentCirclesQuery } from "../../../hooks/queries/use-agent-circles-query.js";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../../common/action-button.js";
import { CircleSelector } from "../../common/circle-selector.js";
import type { ApiError } from "../../../services/api-client.types.js";

interface AddArtifactDialogProps {
  agentId: string;
  isCircle?: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

/**
 * Dialog for uploading a file as an agent or circle artifact.
 * When isCircle is true, shows a circle selector for the agent's direct memberships.
 */
export function AddArtifactDialog({ agentId, isCircle, onClose, onUploaded }: AddArtifactDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);
  const [filenameOverride, setFilenameOverride] = useState("");
  const [selectedCircleId, setSelectedCircleId] = useState("");

  const { data: circles = [] } = useAgentCirclesQuery(agentId);
  const resolvedFilename = resolveFilename(filenameOverride.trim(), selectedFile?.name);

  const uploadMutation = useMutation<ArtifactMetadata, ApiError, void>({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error("No file selected");
      }

      const response = isCircle
        ? await uploadCircleArtifact<ArtifactMetadata>(selectedCircleId, selectedFile, resolvedFilename)
        : await uploadArtifact<ArtifactMetadata>(agentId, selectedFile, resolvedFilename);

      return unwrapResponse(response);
    },
    onSuccess: () => {
      onUploaded();
      onClose();
    },
  });

  const canSubmit =
    selectedFile &&
    resolvedFilename.length > 0 &&
    (!isCircle || selectedCircleId.length > 0) &&
    !uploadMutation.isPending;

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }, []);

  const handleFilenameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setFilenameOverride(event.target.value);
  }, []);

  const handleFilePickerClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleUpload = useCallback(() => {
    uploadMutation.mutate();
  }, [uploadMutation]);

  return (
    <div className="flex flex-col">
      <div className="p-3 space-y-3">
        {/* Circle selector (circle mode only) */}
        {isCircle && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-neutral">Circle</label>
            {circles.length === 0 ? (
              <p className="text-xs text-text-muted italic">No circles available</p>
            ) : (
              <CircleSelector
                circles={circles}
                value={selectedCircleId}
                onChange={setSelectedCircleId}
                menuId="add-artifact-circle"
              />
            )}
          </div>
        )}

        {/* File picker */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-neutral">File</label>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-border-subtle text-sm text-text-neutral hover:bg-surface-elevated transition-colors"
            onClick={handleFilePickerClick}
          >
            <Upload className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <span className="truncate">{selectedFile ? selectedFile.name : "Choose a file..."}</span>
          </button>
        </div>

        {/* Optional filename override */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-neutral">Filename (optional)</label>
          <input
            type="text"
            className="w-full px-3 py-1.5 rounded-md border border-border-subtle bg-surface text-sm text-text-base placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-border-focus"
            placeholder={selectedFile?.name ?? "Uses original filename if empty"}
            value={filenameOverride}
            onChange={handleFilenameChange}
          />
        </div>

        {/* Error */}
        {uploadMutation.isError && <p className="text-xs text-error">{uploadMutation.error.message}</p>}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={onClose} disabled={uploadMutation.isPending} />
        <ActionButton
          label={uploadMutation.isPending ? "Uploading..." : "Upload"}
          variant={ACTION_BUTTON_VARIANT.PRIMARY}
          onClick={handleUpload}
          disabled={!canSubmit}
        />
      </div>
    </div>
  );
}

/** If user provided an override without an extension, append the extension from the original file */
function resolveFilename(override: string, originalName?: string): string {
  if (!override) {
    return originalName ?? "";
  }

  const hasExtension = override.includes(".");
  if (hasExtension || !originalName) {
    return override;
  }

  const dotIndex = originalName.lastIndexOf(".");
  if (dotIndex < 0) {
    return override;
  }

  return override + originalName.slice(dotIndex);
}
