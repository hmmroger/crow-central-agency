import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { cn } from "../../utils/cn";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Renders markdown content as sanitized HTML using the .markdown-content class
 * for styling (defined in index.css).
 * Content is sanitized via DOMPurify to prevent XSS.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const sanitizedHtml = useMemo(() => {
    const rawHtml = marked.parse(content, { async: false }) as string;

    // Sanitize to prevent XSS — DOMPurify strips any malicious content
    return DOMPurify.sanitize(rawHtml);
  }, [content]);

  return (
    <div
      className={cn("markdown-content leading-relaxed", className)}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
