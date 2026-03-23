import { useCallback, useState } from "react";
import { Sparkles } from "lucide-react";
import { apiClient } from "../../services/api-client.js";

interface GenerationPanelProps {
  /** Current persona text — used as context for generation */
  currentPersona: string;
  /** Current agent description — used as context */
  currentDescription: string;
  /** Called when persona text is generated and user applies it */
  onPersonaGenerated: (persona: string) => void;
  /** Called when AGENT.md text is generated and user applies it */
  onAgentMdGenerated: (agentMd: string) => void;
}

type GenerationTarget = "persona" | "agentmd";

/**
 * AI text generation panel for persona and AGENT.md content.
 * User provides a prompt describing what they want. The panel sends it
 * to a general-purpose generation endpoint with relevant context.
 */
export function GenerationPanel({
  currentPersona,
  currentDescription,
  onPersonaGenerated,
  onAgentMdGenerated,
}: GenerationPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [activeTarget, setActiveTarget] = useState<GenerationTarget | undefined>(undefined);

  /** Build context string from available agent data */
  const buildContext = useCallback(
    (target: GenerationTarget) => {
      const parts: string[] = [];

      if (currentDescription) {
        parts.push(`Agent description: ${currentDescription}`);
      }

      if (target === "agentmd" && currentPersona) {
        parts.push(`Agent persona: ${currentPersona}`);
      }

      return parts.length > 0 ? parts.join("\n") : undefined;
    },
    [currentDescription, currentPersona]
  );

  /** Generate text for the given target */
  const handleGenerate = useCallback(
    async (target: GenerationTarget) => {
      const userPrompt = prompt.trim();

      if (!userPrompt) {
        return;
      }

      setGenerating(true);
      setActiveTarget(target);

      try {
        const response = await apiClient.post<{ content: string }>("/generate", {
          prompt: userPrompt,
          context: buildContext(target),
        });

        if (response.success) {
          setPreview(response.data.content);
        }
      } catch {
        // Generation service may not be available
      } finally {
        setGenerating(false);
      }
    },
    [prompt, buildContext]
  );

  /** Apply the preview to the target field */
  const applyPreview = useCallback(() => {
    if (!preview || !activeTarget) {
      return;
    }

    if (activeTarget === "persona") {
      onPersonaGenerated(preview);
    } else {
      onAgentMdGenerated(preview);
    }

    setPreview(undefined);
    setActiveTarget(undefined);
    setPrompt("");
  }, [preview, activeTarget, onPersonaGenerated, onAgentMdGenerated]);

  return (
    <div className="space-y-3">
      {/* Prompt input */}
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Describe what you want generated (e.g. 'Create a persona for a security-focused code reviewer that is thorough but friendly')"
        rows={3}
        className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
      />

      {/* Generate buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-secondary bg-surface-elevated hover:text-text-primary transition-colors disabled:opacity-30"
          onClick={() => handleGenerate("persona")}
          disabled={generating || !prompt.trim()}
        >
          <Sparkles className="h-3 w-3" />
          {generating && activeTarget === "persona" ? "Generating..." : "Generate Persona"}
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-secondary bg-surface-elevated hover:text-text-primary transition-colors disabled:opacity-30"
          onClick={() => handleGenerate("agentmd")}
          disabled={generating || !prompt.trim()}
        >
          <Sparkles className="h-3 w-3" />
          {generating && activeTarget === "agentmd" ? "Generating..." : "Generate AGENT.md"}
        </button>
      </div>

      {/* Preview */}
      {preview && activeTarget && (
        <div className="space-y-2 p-3 rounded-md bg-surface-inset border border-border-subtle">
          <p className="text-xs text-text-muted">Preview ({activeTarget === "persona" ? "Persona" : "AGENT.md"}):</p>
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{preview}</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-xs bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
              onClick={applyPreview}
            >
              Apply
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-xs text-text-muted hover:text-text-primary transition-colors"
              onClick={() => {
                setPreview(undefined);
                setActiveTarget(undefined);
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
