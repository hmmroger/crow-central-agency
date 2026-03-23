import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { MarkdownRenderer } from "../common/markdown-renderer.js";

interface AgentMdEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/** Shared line height for gutter and textarea alignment */
const LINE_HEIGHT = "1.25rem";

/**
 * Code-editor-style markdown editor with line numbers and edit/preview toggle.
 * Pure controlled component — parent owns the state and save logic.
 */
export function AgentMdEditor({ value, onChange }: AgentMdEditorProps) {
  const [previewing, setPreviewing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  /** Restore cursor position after React commits DOM mutations */
  useLayoutEffect(() => {
    if (pendingSelectionRef.current && textareaRef.current) {
      textareaRef.current.selectionStart = pendingSelectionRef.current.start;
      textareaRef.current.selectionEnd = pendingSelectionRef.current.end;
      pendingSelectionRef.current = null;
    }
  });

  /** Sync line numbers scroll with textarea */
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  /** Handle tab key for indentation */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Tab") {
        return;
      }

      event.preventDefault();
      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (start === end) {
        // No selection — insert two spaces at cursor
        const newValue = value.substring(0, start) + "  " + value.substring(end);
        pendingSelectionRef.current = { start: start + 2, end: start + 2 };
        onChange(newValue);
      } else {
        // Multi-line selection — indent every selected line
        const before = value.substring(0, start);
        const selected = value.substring(start, end);
        const after = value.substring(end);
        const indented = selected.replace(/^/gm, "  ");
        const addedChars = indented.length - selected.length;
        pendingSelectionRef.current = { start, end: end + addedChars };
        onChange(before + indented + after);
      }
    },
    [value, onChange]
  );

  const lineNumbers = useMemo(() => {
    const count = Math.max(value.split("\n").length, 1);

    return Array.from({ length: count }, (_, index) => index + 1);
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">Persistent instructions loaded into every query.</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              previewing
                ? "text-text-muted hover:text-text-primary hover:bg-surface-elevated"
                : "text-primary bg-primary/10"
            }`}
            onClick={() => setPreviewing(false)}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              previewing
                ? "text-primary bg-primary/10"
                : "text-text-muted hover:text-text-primary hover:bg-surface-elevated"
            }`}
            onClick={() => setPreviewing(true)}
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
        </div>
      </div>

      {previewing ? (
        <div className="min-h-80 max-h-[70vh] px-4 py-3 rounded-md bg-surface-inset border border-border-subtle overflow-y-auto">
          {value ? (
            <MarkdownRenderer content={value} />
          ) : (
            <span className="text-xs text-text-muted italic">Nothing to preview</span>
          )}
        </div>
      ) : (
        <div className="relative flex min-h-80 max-h-[70vh] rounded-md bg-surface-inset border border-border-subtle overflow-hidden">
          {/* Line numbers gutter */}
          <div
            ref={lineNumbersRef}
            className="flex-none w-12 py-3 pr-2 text-right text-xs font-mono text-text-muted/50 select-none overflow-hidden border-r border-border-subtle bg-surface-inset"
            aria-hidden="true"
          >
            {lineNumbers.map((lineNumber) => (
              <div key={lineNumber} style={{ height: LINE_HEIGHT, lineHeight: LINE_HEIGHT }}>
                {lineNumber}
              </div>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            placeholder="# Agent Instructions&#10;&#10;Write persistent instructions here..."
            spellCheck={false}
            style={{ lineHeight: LINE_HEIGHT }}
            className="flex-1 py-3 pl-3 pr-3 text-sm font-mono text-text-primary bg-transparent placeholder:text-text-muted focus:outline-none resize-none overflow-y-auto"
          />
        </div>
      )}
    </div>
  );
}
