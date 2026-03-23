import { useCallback, useRef, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { MarkdownRenderer } from "../common/markdown-renderer.js";

interface AgentMdEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Code-editor-style markdown editor with line numbers and edit/preview toggle.
 * Pure controlled component — parent owns the state and save logic.
 */
export function AgentMdEditor({ value, onChange }: AgentMdEditorProps) {
  const [previewing, setPreviewing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  /** Sync line numbers scroll with textarea */
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  /** Handle tab key for indentation */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Tab") {
        event.preventDefault();
        const textarea = event.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = value.substring(0, start) + "  " + value.substring(end);

        onChange(newValue);

        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
          textarea.selectionStart = start + 2;
          textarea.selectionEnd = start + 2;
        });
      }
    },
    [value, onChange]
  );

  const lineCount = Math.max(value.split("\n").length, 1);
  const lineNumbers = Array.from({ length: lineCount }, (_, index) => index + 1);

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
            className="flex-none w-10 py-3 pr-2 text-right text-xs font-mono text-text-muted/50 select-none overflow-hidden border-r border-border-subtle bg-surface-inset"
            aria-hidden="true"
          >
            {lineNumbers.map((lineNumber) => (
              <div key={lineNumber} className="leading-5">
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
            className="flex-1 py-3 pl-3 pr-3 text-sm font-mono leading-5 text-text-primary bg-transparent placeholder:text-text-muted focus:outline-none resize-none overflow-y-auto"
          />
        </div>
      )}
    </div>
  );
}
