import { useEffect, useMemo, useRef, type Ref } from "react";
import { NOTE_CONTENT_TYPE, type NoteFileMetadata } from "@crow-central-agency/shared";
import { useNoteContentQuery } from "../../hooks/queries/use-note-content-query.js";
import { cn } from "../../utils/cn.js";
import { lexMarkdown } from "../../utils/marked-config.js";
import { MarkdownDocumentRenderer } from "../common/markdown/markdown-document-renderer.js";
import { ImageViewer } from "../common/image-viewer.js";
import { useMarkdownFind } from "../common/find/use-markdown-find.js";
import type { FindResult, FindSurfaceHandle } from "../common/find/find.types.js";

interface NoteReaderProps {
  note: NoteFileMetadata;
  findRef: Ref<FindSurfaceHandle>;
  onFindResult: (result?: FindResult) => void;
}

const STATUS_CLASS = "p-panel text-sm text-text-muted";

/**
 * Read-only surface for a note — a trashed one included: markdown for text
 * notes, a viewer for images, and a placeholder for anything the app cannot
 * display.
 */
export function NoteReader({ note, findRef, onFindResult }: NoteReaderProps) {
  const isPreviewable = note.contentType !== NOTE_CONTENT_TYPE.UNKNOWN;
  const { data, isLoading, isError, error, refetch } = useNoteContentQuery(note.id, { enabled: isPreviewable });
  const loadedTimestamp = data?.type === "text" ? data.updatedTimestamp : undefined;
  const loadedContent = data?.type === "text" ? data.content : undefined;
  const markdownDocument = useMemo(
    () => (loadedContent === undefined ? undefined : lexMarkdown(loadedContent)),
    [loadedContent]
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const find = useMarkdownFind({
    itemId: note.id,
    markdownDocument,
    containerRef: canvasRef,
    onResult: onFindResult,
    ref: findRef,
  });

  useEffect(() => {
    if (loadedTimestamp !== undefined && note.updatedTimestamp > loadedTimestamp) {
      void refetch();
    }
  }, [note.updatedTimestamp, loadedTimestamp, refetch]);

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

  if (data?.type === "binary") {
    return <ImageViewer src={data.blobUrl} alt={note.name} />;
  }

  if (!markdownDocument) {
    return <p className={STATUS_CLASS}>No content</p>;
  }

  return (
    <div ref={canvasRef} tabIndex={-1} className="h-full overflow-y-auto px-2 pt-2 outline-none">
      <MarkdownDocumentRenderer
        markdownDocument={markdownDocument}
        marks={find?.marks}
        revealKey={find?.revealKey}
        className="note-canvas"
      />
    </div>
  );
}
