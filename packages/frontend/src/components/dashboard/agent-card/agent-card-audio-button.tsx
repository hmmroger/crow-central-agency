import { useCallback, useMemo, type MouseEvent } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { AGENT_MESSAGE_ROLE, AGENT_MESSAGE_TYPE, type AgentMessage } from "@crow-central-agency/shared";
import { useMessageAudio } from "../../../hooks/queries/use-message-audio.js";
import { useSystemCapabilitiesQuery } from "../../../hooks/queries/use-system-capabilities-query.js";
import { MESSAGE_AUDIO_STATUS, useMessageAudioStore } from "../../../stores/message-audio-store.js";

interface AgentCardAudioButtonProps {
  agentId: string;
  messages: AgentMessage[];
  isStreaming: boolean;
}

function findLatestAgentTextMessage(messages: AgentMessage[]): AgentMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === AGENT_MESSAGE_ROLE.AGENT && message.type === AGENT_MESSAGE_TYPE.TEXT) {
      return message;
    }
  }

  return undefined;
}

/**
 * Card-action button that plays/generates audio for the agent's latest text message.
 * Disabled while streaming or when the agent has no text message yet.
 */
export function AgentCardAudioButton({ agentId, messages, isStreaming }: AgentCardAudioButtonProps) {
  const { playOrGenerate } = useMessageAudio(agentId);
  const { data: capabilities } = useSystemCapabilitiesQuery();
  const activeMessageId = useMessageAudioStore((state) => state.activeMessageId);
  const status = useMessageAudioStore((state) => state.status);

  const target = useMemo(() => findLatestAgentTextMessage(messages), [messages]);
  const isActive = target !== undefined && activeMessageId === target.id;
  const isGenerating = isActive && status === MESSAGE_AUDIO_STATUS.GENERATING;
  const isPlaying = isActive && status === MESSAGE_AUDIO_STATUS.PLAYING;
  const audioGenerationAvailable = capabilities?.audioGeneration === true;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (target) {
        void playOrGenerate(target);
      }
    },
    [playOrGenerate, target]
  );

  const disabled = !audioGenerationAvailable || isStreaming || target === undefined || isGenerating;
  const title = !audioGenerationAvailable
    ? "Audio generation is not configured"
    : target === undefined
      ? "No agent message to play"
      : isStreaming
        ? "Cannot play while streaming"
        : isPlaying
          ? "Stop audio"
          : isGenerating
            ? "Generating audio"
            : "Play latest message";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      data-active={isActive ? "true" : undefined}
      className="p-1.5 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-text-muted disabled:hover:bg-transparent"
      title={title}
      aria-label={title}
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isPlaying ? (
        <Square className="h-4 w-4 text-primary/50" />
      ) : (
        <Play className="h-4 w-4" />
      )}
    </button>
  );
}
