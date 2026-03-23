import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Renders markdown content as sanitized HTML using the .markdown-content class
 * for styling (defined in index.css).
 * Content is sanitized via DOMPurify to prevent XSS.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const sanitizedHtml = useMemo(() => {
    const rawHtml = marked.parse(content, { async: false }) as string;

    // Sanitize to prevent XSS — DOMPurify strips any malicious content
    return DOMPurify.sanitize(rawHtml);
  }, [content]);

  return <div className="markdown-content" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
}
