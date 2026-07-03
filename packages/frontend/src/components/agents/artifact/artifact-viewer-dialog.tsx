import { useCallback, useImperativeHandle, useState } from "react";
import type { ChangeEvent, Ref } from "react";
import { Pencil } from "lucide-react";
import { ARTIFACT_CONTENT_TYPE } from "@crow-central-agency/shared";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { ArtifactContentRenderer } from "./artifact-content-renderer.js";
import { ArtifactTagList } from "./artifact-tag-list.js";
import { canUserModifyArtifact } from "./artifact-permissions.js";
import { useArtifactContentQuery } from "../../../hooks/queries/use-artifact-content-query.js";
import { useUpdateArtifactContent } from "../../../hooks/queries/use-artifact-mutations.js";
import type { ModalDialogHandle } from "../../../providers/modal-dialog-provider.types.js";
import { useConfirmDiscard } from "../../../hooks/dialogs/use-confirm-discard.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../../common/action-button.js";
import { CopyButton } from "../../common/copy-button.js";

/** Tags shown before collapsing in the wider dialog viewer */
const VISIBLE_TAG_LIMIT = 12;

/** Backend error code returned when the artifact changed since it was read (optimistic-lock miss) */
const ARTIFACT_CONFLICT_ERROR_CODE = "conflict";

interface ArtifactViewerDialogProps {
  artifact: ArtifactMetadata;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
  /** Injected by ModalDialogRenderer for the dismiss guard */
  ref: Ref<ModalDialogHandle>;
}

/**
 * Modal content for viewing an artifact in a larger window, with inline raw-text editing for
 * user-owned text artifacts. Exposes a ModalDialogHandle so the renderer blocks dismiss while edits
 * are unsaved. Designed to be used with `showDialog()` from the modal dialog provider.
 */
export function ArtifactViewerDialog({ artifact, onClose, ref }: ArtifactViewerDialogProps) {
  const { entityType, entityId, filename, tags } = artifact;
  const { data, refetch } = useArtifactContentQuery(entityType, entityId, filename);
  const textContent = data?.type === "text" ? data.content : undefined;
  // Gate on the declared contentType, not the fetched type: adapter-backed binaries (e.g. .docx) are
  // converted to text for display but are not raw-text editable.
  const canEdit =
    canUserModifyArtifact(artifact) && artifact.contentType === ARTIFACT_CONTENT_TYPE.TEXT && textContent !== undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const isDirty = isEditing && editedContent !== (textContent ?? "");

  const updateContent = useUpdateArtifactContent();
  const { mutateAsync: updateContentAsync, isPending: isSaving, isError, error, reset } = updateContent;

  const confirmDiscard = useConfirmDiscard(isDirty);

  useImperativeHandle(
    ref,
    () => ({
      canDismiss: confirmDiscard,
    }),
    [confirmDiscard]
  );

  const handleEnterEdit = useCallback(() => {
    setEditedContent(textContent ?? "");
    setIsEditing(true);
  }, [textContent]);

  const handleContentChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setEditedContent(event.target.value);
  }, []);

  const exitEdit = useCallback(() => {
    setIsEditing(false);
    setEditedContent("");
    reset();
  }, [reset]);

  const handleCancel = useCallback(async () => {
    const allowed = await confirmDiscard();
    if (allowed) {
      exitEdit();
    }
  }, [confirmDiscard, exitEdit]);

  const handleSave = useCallback(async () => {
    try {
      await updateContentAsync({ artifact, content: editedContent });
      exitEdit();
    } catch {
      // Surfaced via the mutation error state below
    }
  }, [updateContentAsync, artifact, editedContent, exitEdit]);

  const handleReload = useCallback(() => {
    void refetch();
    exitEdit();
  }, [refetch, exitEdit]);

  const isConflict = isError && error?.code === ARTIFACT_CONFLICT_ERROR_CODE;
  const errorMessage = isError
    ? isConflict
      ? "This file changed since you opened it. Reload to get the latest version."
      : error.message
    : undefined;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tags strip */}
      {!isEditing && tags && tags.length > 0 && (
        <ArtifactTagList tags={tags} maxVisible={VISIBLE_TAG_LIMIT} className="px-3 pt-3" />
      )}

      {/* Content area with inset background */}
      {isEditing ? (
        <textarea
          value={editedContent}
          onChange={handleContentChange}
          spellCheck={false}
          aria-label={`Edit content of ${filename}`}
          className="flex-1 min-h-(--min-height-artifact-editor) resize-none overflow-y-auto m-3 p-3 rounded-md bg-surface-inset border border-border-subtle text-xs font-mono text-text-neutral focus:outline-none focus:ring-1 focus:ring-border-focus"
        />
      ) : (
        <div className="flex-1 overflow-y-auto m-3 p-3 rounded-md bg-surface-inset border border-border-subtle">
          <ArtifactContentRenderer entityType={entityType} entityId={entityId} filename={filename} />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-elevated">
        {isEditing ? (
          <>
            <div className="flex items-center gap-2 min-w-0">
              {errorMessage && <span className="text-xs text-error truncate">{errorMessage}</span>}
              {isConflict && <ActionButton label="Reload" onClick={handleReload} />}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ActionButton label="Cancel" onClick={handleCancel} disabled={isSaving} />
              <ActionButton
                label={isSaving ? "Saving..." : "Save"}
                variant={ACTION_BUTTON_VARIANT.PRIMARY}
                onClick={handleSave}
                disabled={!isDirty || isSaving}
              />
            </div>
          </>
        ) : (
          <>
            {textContent !== undefined ? <CopyButton text={textContent} /> : <span />}
            <div className="flex items-center gap-2">
              {canEdit && <ActionButton icon={Pencil} label="Edit" onClick={handleEnterEdit} />}
              <ActionButton label="Close" onClick={onClose} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
