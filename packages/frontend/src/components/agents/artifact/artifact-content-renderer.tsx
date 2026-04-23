import { useEffect } from "react";
import type { EntityType } from "@crow-central-agency/shared";
import { useArtifactContentQuery } from "../../../hooks/queries/use-artifact-content-query.js";
import type { ArtifactContent } from "../../../hooks/queries/use-artifact-content-query.js";
import { MarkdownRenderer } from "../../common/markdown-renderer.js";
import { ImageViewer } from "../../common/image-viewer.js";

const MARKDOWN_RENDERED_EXTENSIONS = new Set([".md", ".docx"]);

interface ArtifactContentRendererProps {
  entityType: EntityType;
  entityId: string;
  filename: string;
}

interface ArtifactContentViewProps {
  data: ArtifactContent;
  filename: string;
}

/**
 * Fetch and render artifact content. Handles text/markdown/image/binary,
 * loading/error states, and blob URL cleanup on unmount.
 */
export function ArtifactContentRenderer({ entityType, entityId, filename }: ArtifactContentRendererProps) {
  const { data, isLoading: loading, isError } = useArtifactContentQuery(entityType, entityId, filename);

  useEffect(() => {
    return () => {
      if (data?.type === "binary") {
        URL.revokeObjectURL(data.blobUrl);
      }
    };
  }, [data]);

  if (loading) {
    return <span className="text-sm text-text-muted">Loading...</span>;
  }

  if (isError) {
    return <span className="text-sm text-error">Failed to load artifact content.</span>;
  }

  if (!data) {
    return <span className="text-sm text-text-muted">No content</span>;
  }

  return <ArtifactContentView data={data} filename={filename} />;
}

function ArtifactContentView({ data, filename }: ArtifactContentViewProps) {
  if (data.type === "text") {
    if (isMarkdownRendered(filename)) {
      return <MarkdownRenderer content={data.content} />;
    }

    return <pre className="text-xs font-mono text-text-neutral whitespace-pre-wrap">{data.content}</pre>;
  }

  if (data.mimeType.startsWith("image/")) {
    return <ImageViewer src={data.blobUrl} alt={filename} filename={filename} />;
  }

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-sm text-text-muted italic">Preview not supported for this file type ({data.mimeType})</p>
    </div>
  );
}

function isMarkdownRendered(filename: string): boolean {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) {
    return false;
  }

  return MARKDOWN_RENDERED_EXTENSIONS.has(filename.slice(dotIndex).toLowerCase());
}
