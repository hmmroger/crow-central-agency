import { useEffect } from "react";
import { NOTE_CONTENT_TYPE, type NoteFileMetadata } from "@crow-central-agency/shared";
import { useNoteContentQuery } from "../../hooks/queries/use-note-content-query.js";
import { MarkdownRenderer } from "../common/markdown-renderer.js";
import { ImageViewer } from "../common/image-viewer.js";

interface NoteReaderProps {
  note: NoteFileMetadata;
}

/**
 * Read-only renderer for a single note: markdown for text notes, a viewer for
 * images, and a placeholder for anything the app cannot display.
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
    return <p className="text-sm text-text-muted italic">Preview is not available for this note ({note.path}).</p>;
  }

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading...</p>;
  }

  if (isError) {
    return <p className="text-sm text-error">{error.message}</p>;
  }

  if (!data) {
    return <p className="text-sm text-text-muted">No content</p>;
  }

  if (data.type === "text") {
    return <MarkdownRenderer content={data.content} />;
  }

  return <ImageViewer src={data.blobUrl} alt={note.name} />;
}
