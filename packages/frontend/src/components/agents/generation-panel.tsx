import { useCallback, useState } from "react";
import { Sparkles } from "lucide-react";
import { apiClient } from "../../services/api-client.js";

interface GenerationPanelProps {
  agentId: string;
  onPersonaGenerated: (persona: string) => void;
}

/**
 * Generate persona and AGENT.md content via OpenAI-compatible API.
 * Buttons are hidden if generation service is unavailable.
 */
export function GenerationPanel({ agentId, onPersonaGenerated }: GenerationPanelProps) {
  const [generatingPersona, setGeneratingPersona] = useState(false);
  const [preview, setPreview] = useState<string | undefined>(undefined);

  const generatePersona = useCallback(async () => {
    setGeneratingPersona(true);

    try {
      const response = await apiClient.post<{ content: string }>(`/agents/${agentId}/generate-persona`);

      if (response.success) {
        setPreview(response.data.content);
      }
    } catch {
      // Generation service may not be available
    } finally {
      setGeneratingPersona(false);
    }
  }, [agentId]);

  const applyPreview = useCallback(() => {
    if (preview) {
      onPersonaGenerated(preview);
      setPreview(undefined);
    }
  }, [preview, onPersonaGenerated]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-30"
          onClick={generatePersona}
          disabled={generatingPersona}
        >
          <Sparkles className="h-3 w-3" />
          {generatingPersona ? "Generating..." : "Generate Persona"}
        </button>
      </div>

      {preview && (
        <div className="space-y-2 p-2 rounded bg-surface-inset border border-border-subtle">
          <p className="text-xs text-text-muted">Preview:</p>
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{preview}</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-2 py-1 rounded text-xs bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
              onClick={applyPreview}
            >
              Apply
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded text-xs text-text-muted hover:text-text-primary transition-colors"
              onClick={() => setPreview(undefined)}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
