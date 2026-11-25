import { useMemo } from "react";
import { lexMarkdown } from "../../../utils/marked-config";
import { MarkdownDocumentRenderer } from "./markdown-document-renderer";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

/** Renders markdown content with mermaid diagram support */
export function MarkdownRenderer({ content, className, isStreaming }: MarkdownRendererProps) {
  const markdownDocument = useMemo(() => lexMarkdown(content), [content]);

  return (
    <MarkdownDocumentRenderer markdownDocument={markdownDocument} className={className} isStreaming={isStreaming} />
  );
}
