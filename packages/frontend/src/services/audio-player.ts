export interface PlaybackController {
  /** Stop playback immediately. Idempotent. */
  stop: () => void;
  /** Resolves when playback ends (either naturally or by stop()). */
  ended: Promise<void>;
}

/**
 * Play an audio blob via HTMLAudioElement. The backend audio-generation
 * service normalizes provider PCM responses to WAV before storage, so the
 * frontend only ever sees container/compressed formats here.
 */
export async function playAudio(blob: Blob): Promise<PlaybackController> {
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);

  let resolveEnded: (() => void) | undefined;
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });

  const cleanup = () => {
    const resolve = resolveEnded;
    resolveEnded = undefined;
    URL.revokeObjectURL(objectUrl);
    resolve?.();
  };

  audio.onended = cleanup;
  audio.onerror = cleanup;

  try {
    await audio.play();
  } catch (error) {
    cleanup();
    throw error;
  }

  return {
    stop: () => {
      audio.pause();
      audio.src = "";
      cleanup();
    },
    ended,
  };
}
