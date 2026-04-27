import { create } from "zustand";

export const MESSAGE_AUDIO_STATUS = {
  IDLE: "idle",
  GENERATING: "generating",
  PLAYING: "playing",
} as const;

export type MessageAudioStatus = (typeof MESSAGE_AUDIO_STATUS)[keyof typeof MESSAGE_AUDIO_STATUS];

interface MessageAudioState {
  /** The message currently generating or playing audio, or undefined when idle. */
  activeMessageId?: string;
  /** Current playback status for `activeMessageId`. */
  status: MessageAudioStatus;
  /** Mark a message as generating or playing. */
  setActive: (messageId: string, status: Exclude<MessageAudioStatus, "idle">) => void;
  /** Reset to idle. */
  clear: () => void;
}

export const useMessageAudioStore = create<MessageAudioState>((set) => ({
  activeMessageId: undefined,
  status: MESSAGE_AUDIO_STATUS.IDLE,
  setActive: (messageId, status) => set({ activeMessageId: messageId, status }),
  clear: () => set({ activeMessageId: undefined, status: MESSAGE_AUDIO_STATUS.IDLE }),
}));
