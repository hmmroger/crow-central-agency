import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";
import { ensureMermaidInit } from "../../utils/mermaid-config";
import { parseMarkdown } from "../../utils/marked-config";
import { sanitizeSvg } from "../../utils/html-sanitizer";
import { cn } from "../../utils/cn";

/**
 * Inject copy-button HTML into <pre><code> blocks so buttons
 * are part of the rendered string and survive React re-renders.
 */
function injectCopyButtons(html: string): string {
  return html.replace(
    /<pre([^>]*)>(\s*<code)/g,
    '<pre$1><button class="code-copy-btn" aria-label="Copy code to clipboard">Copy</button>$2'
  );
}

// Initialize mermaid with shared settings (called once, idempotent)
ensureMermaidInit();

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

/**
 * Renders markdown content with mermaid diagram support
 */
export function MarkdownRenderer({ content, className, isStreaming }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Memoize parsed HTML with copy buttons injected
  const html = useMemo(() => injectCopyButtons(parseMarkdown(content)), [content]);
  const [renderedHtml, setRenderedHtml] = useState(html);

  // Render mermaid diagrams after mount (skip during streaming)
  useEffect(() => {
    const container = containerRef.current;
    if (isStreaming || !container) {
      setRenderedHtml(html);
      return;
    }

    const mermaidContainers = container.querySelectorAll(".mermaid-container[data-mermaid]:not([data-rendered])");
    if (!mermaidContainers.length) {
      setRenderedHtml(html);
      return;
    }

    const renderDiagrams = async () => {
      await Promise.all(
        Array.from(mermaidContainers).map(async (el, index) => {
          const source = decodeURIComponent(el.getAttribute("data-mermaid") || "");
          if (source) {
            try {
              el.setAttribute("data-rendered", "true");
              const { svg } = await mermaid.render(`mermaid-${Date.now()}-${index}`, source, el);
              el.innerHTML = sanitizeSvg(svg);
              el.className = "mermaid-container";
            } catch (error) {
              el.setAttribute("data-rendered", "true");
              el.innerHTML = `<pre class="text-xs text-error">Mermaid Error: ${error}</pre>`;
            }
          }
        })
      );

      setRenderedHtml(container.innerHTML);
    };

    renderDiagrams();
  }, [html, isStreaming]);

  // Event delegation for copy buttons (survives React re-renders)
  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("code-copy-btn")) {
      return;
    }

    const pre = target.closest("pre");
    if (!pre) {
      return;
    }

    const code = pre.querySelector("code");
    const text = code?.textContent ?? pre.textContent ?? "";

    navigator.clipboard
      .writeText(text)
      .then(() => {
        target.textContent = "Copied!";
        setTimeout(() => {
          target.textContent = "Copy";
        }, 2000);
      })
      .catch(() => {
        console.warn("Clipboard not available.");
      });
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("markdown-content", className)}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
      onClick={handleContainerClick}
    />
  );
}
