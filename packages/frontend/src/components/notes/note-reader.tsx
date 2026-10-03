import { useEffect } from "react";
import { NOTE_CONTENT_TYPE, type NoteFileMetadata } from "@crow-central-agency/shared";
import { useNoteContentQuery } from "../../hooks/queries/use-note-content-query.js";
import { cn } from "../../utils/cn.js";
import { MarkdownRenderer } from "../common/markdown/markdown-renderer.js";
import { ImageViewer } from "../common/image-viewer.js";

interface NoteReaderProps {
  note: NoteFileMetadata;
}

const STATUS_CLASS = "p-panel text-sm text-text-muted";

/**
 * Read-only surface for a note — a trashed one included: markdown for text
 * notes, a viewer for images, and a placeholder for anything the app cannot
 * display.
 */
export function NoteReader({ note }: NoteReaderProps) {
  const isPreviewable = note.contentType !== NOTE_CONTENT_TYPE.UNKNOWN;
  const { data, isLoading, isError, error } = useNoteContentQuery(note.id, { enabled: isPreviewable });

  useEffect(() => {
    return () => {
      if (data?.type === "binary") {
        URL.revokeObjectURL(data.blobUrl);
      }
    };
  }, [data]);

  if (!isPreviewable) {
    return <p className={cn(STATUS_CLASS, "italic")}>Preview is not available for this note ({note.path}).</p>;
  }

  if (isLoading) {
    return <p className={STATUS_CLASS}>Loading...</p>;
  }

  if (isError) {
    return <p className="p-panel text-sm text-error">{error.message}</p>;
  }

  if (!data) {
    return <p className={STATUS_CLASS}>No content</p>;
  }

  if (data.type === "text") {
    return (
      <div className="h-full overflow-y-auto px-2 pt-2">
        <MarkdownRenderer content={data.content} className="note-canvas" />
      </div>
    );
  }

  return <ImageViewer src={data.blobUrl} alt={note.name} />;
}
