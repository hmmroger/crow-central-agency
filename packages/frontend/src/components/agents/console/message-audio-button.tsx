import { useCallback } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { AGENT_MESSAGE_ROLE, AGENT_MESSAGE_TYPE, type AgentMessage } from "@crow-central-agency/shared";
import { useMessageAudio } from "../../../hooks/queries/use-message-audio.js";
import { useSystemCapabilitiesQuery } from "../../../hooks/queries/use-system-capabilities-query.js";
import { MESSAGE_AUDIO_STATUS, useMessageAudioStore } from "../../../stores/message-audio-store.js";

interface MessageAudioButtonProps {
  agentId: string;
  message: AgentMessage;
}

function isApplicable(message: AgentMessage): boolean {
  return message.role === AGENT_MESSAGE_ROLE.AGENT && message.type === AGENT_MESSAGE_TYPE.TEXT;
}

/**
 * Compact play/stop button rendered next to a message.
 * Self-gates: returns null for messages where audio playback is not meaningful
 * (anything other than agent-authored text). Displays a spinner while generating,
 * a stop icon while playing, otherwise play.
 */
export function MessageAudioButton({ agentId, message }: MessageAudioButtonProps) {
  const { playOrGenerate } = useMessageAudio(agentId);
  const { data: capabilities } = useSystemCapabilitiesQuery();
  const activeMessageId = useMessageAudioStore((state) => state.activeMessageId);
  const status = useMessageAudioStore((state) => state.status);

  const handleClick = useCallback(() => {
    void playOrGenerate(message);
  }, [playOrGenerate, message]);

  if (!isApplicable(message)) {
    return null;
  }

  const isActive = activeMessageId === message.id;
  const isGenerating = isActive && status === MESSAGE_AUDIO_STATUS.GENERATING;
  const isPlaying = isActive && status === MESSAGE_AUDIO_STATUS.PLAYING;
  const audioGenerationAvailable = capabilities?.audioGeneration === true;

  const ariaLabel = !audioGenerationAvailable
    ? "Audio generation is not configured"
    : isPlaying
      ? "Stop audio"
      : isGenerating
        ? "Generating audio"
        : "Play audio";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isGenerating || !audioGenerationAvailable}
      data-active={isActive ? "true" : undefined}
      className="inline-flex items-center justify-center h-5 w-5 rounded border border-border-subtle text-3xs text-text-muted hover:text-text-neutral hover:bg-surface-elevated/50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {isGenerating ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : isPlaying ? (
        <Square className="h-3 w-3 text-primary/50" />
      ) : (
        <Play className="h-3 w-3" />
      )}
    </button>
  );
}
