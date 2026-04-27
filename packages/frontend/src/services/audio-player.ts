import { decodePcm, type PcmFormat } from "./audio-decoder.js";

const PCM_MIME_PATTERN = /^audio\/(?:L\d+|pcm|x-raw)/i;
const SAMPLE_RATE_PATTERN = /rate=(\d+)/i;
const CHANNELS_PATTERN = /channels=(\d+)/i;
const BIT_DEPTH_PATTERN = /audio\/L(\d+)/i;

const DEFAULT_PCM_BIT_DEPTH = 16;
const DEFAULT_PCM_CHANNELS = 1;
const DEFAULT_PCM_SAMPLE_RATE = 24000;

export interface PlaybackController {
  /** Stop playback immediately. Idempotent. */
  stop: () => void;
  /** Resolves when playback ends (either naturally or by stop()). */
  ended: Promise<void>;
}

let sharedAudioContext: AudioContext | undefined;

async function getAudioContext(): Promise<AudioContext> {
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContext();
  }

  if (sharedAudioContext.state === "suspended") {
    await sharedAudioContext.resume();
  }

  return sharedAudioContext;
}

function isPcmMime(mimeType: string): boolean {
  return PCM_MIME_PATTERN.test(mimeType);
}

function parsePcmFormat(mimeType: string): PcmFormat {
  const rateMatch = mimeType.match(SAMPLE_RATE_PATTERN);
  const channelsMatch = mimeType.match(CHANNELS_PATTERN);
  const bitDepthMatch = mimeType.match(BIT_DEPTH_PATTERN);

  return {
    sampleRate: rateMatch ? Number(rateMatch[1]) : DEFAULT_PCM_SAMPLE_RATE,
    channels: channelsMatch ? Number(channelsMatch[1]) : DEFAULT_PCM_CHANNELS,
    bitDepth: bitDepthMatch ? Number(bitDepthMatch[1]) : DEFAULT_PCM_BIT_DEPTH,
  };
}

async function playPcm(blob: Blob, mimeType: string): Promise<PlaybackController> {
  const format = parsePcmFormat(mimeType);
  const arrayBuffer = await blob.arrayBuffer();
  const channelData = decodePcm(arrayBuffer, format);
  const audioContext = await getAudioContext();
  const audioBuffer = audioContext.createBuffer(format.channels, channelData[0].length, format.sampleRate);
  for (let channel = 0; channel < format.channels; channel++) {
    audioBuffer.getChannelData(channel).set(channelData[channel]);
  }

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);

  let resolveEnded: (() => void) | undefined;
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });
  source.onended = () => resolveEnded?.();
  source.start();

  return {
    stop: () => {
      try {
        source.stop();
      } catch {
        // Already stopped — harmless.
      }
    },
    ended,
  };
}

async function playElement(blob: Blob): Promise<PlaybackController> {
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

/**
 * Play an audio blob, dispatching on mime type:
 * - Raw PCM (audio/L{N}, audio/pcm, audio/x-raw) → Web Audio API decode + play.
 * - Compressed/container formats → HTMLAudioElement with a blob URL.
 */
export async function playAudio(blob: Blob, mimeType: string): Promise<PlaybackController> {
  if (isPcmMime(mimeType)) {
    return playPcm(blob, mimeType);
  }

  return playElement(blob);
}
