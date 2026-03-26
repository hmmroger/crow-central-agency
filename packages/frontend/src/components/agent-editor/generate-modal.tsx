import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useGenerateMutation } from "../../hooks/use-generate-mutation.js";
import { MarkdownRenderer } from "../common/markdown-renderer.js";

type GenerationType = "persona" | "agentmd";

interface GenerateModalProps {
  type: GenerationType;
  /** Optional context to send with the prompt (e.g. existing description, persona) */
  context?: string;
  onApply: (content: string) => void;
  onClose: () => void;
}

const TYPE_LABELS: Record<GenerationType, string> = {
  persona: "Persona",
  agentmd: "AGENT.md",
};

/**
 * Modal dialog for AI text generation.
 * User provides a prompt, clicks Generate, previews result,
 * then applies or re-generates.
 */
export function GenerateModal({ type, context, onApply, onClose }: GenerateModalProps) {
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const { mutateAsync: generateAsync, isPending: generating, error: mutationError } = useGenerateMutation();
  const error = mutationError?.message;
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Focus prompt input on mount
  useEffect(() => {
    promptRef.current?.focus();
  }, []);

  /** Send prompt to generation endpoint */
  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    setPreview(undefined);

    try {
      const result = await generateAsync({
        type,
        prompt: trimmedPrompt,
        context,
      });

      setPreview(result.content);
    } catch {
      // Error is surfaced via mutation.error in the UI
    }
  }, [prompt, type, context, generateAsync]);

  /** Apply preview content and close */
  const handleApply = useCallback(() => {
    if (preview) {
      onApply(preview);
      onClose();
    }
  }, [preview, onApply, onClose]);

  const hasPreview = preview !== undefined;
  const label = TYPE_LABELS[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 rounded-lg bg-surface border border-border-subtle shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-text-primary">Generate {label}</h3>
          <button type="button" className="text-text-muted hover:text-text-primary transition-colors" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Prompt */}
          <div>
            <label className="block text-xs text-text-muted mb-1.5">Describe what you want</label>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder={
                type === "persona"
                  ? "e.g. Create a persona for a security-focused code reviewer that is thorough but friendly"
                  : "e.g. Write instructions for a full-stack developer agent focused on React and Node.js projects"
              }
              rows={3}
              className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
            />
          </div>

          {/* Error */}
          {error && <div className="p-2 rounded-md bg-error/10 border border-error/20 text-error text-xs">{error}</div>}

          {/* Preview */}
          {hasPreview && (
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Preview</label>
              <div className="max-h-64 overflow-y-auto px-3 py-2 rounded-md bg-surface-inset border border-border-subtle">
                <MarkdownRenderer content={preview} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle">
          <button
            type="button"
            className="px-3 py-1.5 rounded-md text-xs text-text-muted hover:text-text-primary transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>

          {hasPreview && (
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-xs bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
              onClick={handleApply}
            >
              Apply
            </button>
          )}

          <button
            type="button"
            className="px-3 py-1.5 rounded-md text-xs bg-primary text-text-primary font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
          >
            {generating ? "Generating..." : hasPreview ? "Re-generate" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
