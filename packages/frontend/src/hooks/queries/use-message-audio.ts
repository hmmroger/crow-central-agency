import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AgentMessage } from "@crow-central-agency/shared";
import { apiClient, fetchRaw, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import { playAudio, type PlaybackController } from "../../services/audio-player.js";
import { MESSAGE_AUDIO_STATUS, useMessageAudioStore } from "../../stores/message-audio-store.js";
import { useAgentsContext } from "../../providers/agents-provider.js";

/** Module-level so a new playback always supersedes any previous one across the app. */
let activeController: PlaybackController | undefined;

function stopActive() {
  if (activeController) {
    activeController.stop();
    activeController = undefined;
  }
}

interface MessageAudioActions {
  /**
   * Click handler for the audio button on a message.
   * - If audio for `message` is currently playing → stops.
   * - If audio is annotated → fetches and plays.
   * - Otherwise → generates audio (POST), updates the messages cache, then plays.
   */
  playOrGenerate: (message: AgentMessage) => Promise<void>;
}

export function useMessageAudio(agentId: string): MessageAudioActions {
  const queryClient = useQueryClient();
  const { getAgent } = useAgentsContext();
  const currentVoiceName = getAgent(agentId)?.agentVoiceConfig?.voiceName;

  const playFromServer = useCallback(
    async (messageId: string) => {
      const response = await fetchRaw(`/agents/${agentId}/messages/${messageId}/audio`);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: HTTP ${response.status}`);
      }

      const blob = await response.blob();
      stopActive();
      const controller = await playAudio(blob);
      activeController = controller;
      useMessageAudioStore.getState().setActive(messageId, MESSAGE_AUDIO_STATUS.PLAYING);
      controller.ended.then(() => {
        if (activeController === controller) {
          activeController = undefined;
          useMessageAudioStore.getState().clear();
        }
      });
    },
    [agentId]
  );

  const generateAudio = useCallback(
    async (messageId: string) => {
      const response = await apiClient.post<AgentMessage>(`/agents/${agentId}/messages/${messageId}/audio`);
      const updated = unwrapResponse(response);
      queryClient.setQueryData<AgentMessage[]>(agentKeys.messages(agentId), (prev) => {
        if (!prev) {
          return prev;
        }

        return prev.map((entry) => (entry.id === messageId ? updated : entry));
      });
    },
    [agentId, queryClient]
  );

  const playOrGenerate = useCallback(
    async (message: AgentMessage) => {
      const store = useMessageAudioStore.getState();
      if (store.activeMessageId === message.id && store.status === MESSAGE_AUDIO_STATUS.PLAYING) {
        stopActive();
        store.clear();
        return;
      }

      if (store.status === MESSAGE_AUDIO_STATUS.GENERATING) {
        return;
      }

      stopActive();

      const annotation = message.annotations;
      const hasCachedAudio = annotation?.hasAudioMessage === true;
      const voiceMismatch =
        currentVoiceName !== undefined && hasCachedAudio && annotation?.voiceName !== currentVoiceName;
      const needsGenerate = !hasCachedAudio || voiceMismatch;

      try {
        if (needsGenerate) {
          store.setActive(message.id, MESSAGE_AUDIO_STATUS.GENERATING);
          await generateAudio(message.id);
        }

        await playFromServer(message.id);
      } catch (error) {
        console.error(`[useMessageAudio] failed for message ${message.id}:`, error);
        useMessageAudioStore.getState().clear();
      }
    },
    [currentVoiceName, generateAudio, playFromServer]
  );

  return { playOrGenerate };
}
