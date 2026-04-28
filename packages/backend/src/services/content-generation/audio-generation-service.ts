import { container } from "../../container.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { chunkText } from "./audio-chunker.js";
import { isPcmMime, wrapPcmAsWav, WAV_MIME_TYPE } from "./audio-format.js";
import {
  CONTENT_MODALITY,
  MessageRoles,
  type AudioGenerationOptions,
  type AudioMessage,
  type ContentGenerationAudioResponse,
  type TokenUsage,
} from "./content-generation.types.js";

const DEFAULT_STYLE_PROMPT = [
  "### ROLE",
  "Professional voice narrator with the polished delivery of a public radio host or audiobook reader.",
  "",
  "### TONE",
  "Warm and conversational with confident presence. Clear articulation, never robotic or formal.",
  "",
  "### PACING",
  "Natural speech rhythm. Brief pauses at commas, slightly longer pauses at periods. Questions rise in pitch; statements settle.",
  "",
  "### DELIVERY",
  "Steady energy throughout. Emphasize meaning over individual words; let punctuation guide phrasing and breath.",
  "",
  "### AVOID",
  "Rushing, monotone delivery, theatrical exaggeration, overly formal news-anchor cadence.",
  "",
  "### TRANSCRIPT (every word between <TRANSCRIPT> and </TRANSCRIPT>)",
].join("\n");

const TRANSCRIPT_OPEN_TAG = "<TRANSCRIPT>";
const TRANSCRIPT_CLOSE_TAG = "</TRANSCRIPT>";

const DEFAULT_MAX_CHUNK_CHARS = 1000;

export async function audioGeneration(
  model: string,
  text: string,
  options?: AudioGenerationOptions
): Promise<ContentGenerationAudioResponse> {
  const provider = options?.provider ?? container.audioGenProvider;
  const stylePrompt = options?.stylePrompt ?? DEFAULT_STYLE_PROMPT;
  const maxChunkChars = options?.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;

  const chunks = chunkText(text, maxChunkChars);
  const synthesizeChunk = async (chunk: string) => {
    const response = await provider.synthesizeAudio(model, wrapTranscript(chunk), { ...options, stylePrompt });
    response.message.transcript = chunk;
    return response;
  };

  if (chunks.length === 1) {
    const response = await synthesizeChunk(chunks[0]);
    return normalizeAudioResponse(response);
  }

  const responses: ContentGenerationAudioResponse[] = [];
  for (const chunk of chunks) {
    responses.push(await synthesizeChunk(chunk));
  }

  return normalizeAudioResponse(mergeChunkedResponses(text, responses));
}

function wrapTranscript(text: string): string {
  return `${TRANSCRIPT_OPEN_TAG}\n${text}\n${TRANSCRIPT_CLOSE_TAG}`;
}

function normalizeAudioResponse(response: ContentGenerationAudioResponse): ContentGenerationAudioResponse {
  const { data, mimeType } = response.message;
  if (!data || !isPcmMime(mimeType)) {
    return response;
  }

  return {
    ...response,
    message: {
      ...response.message,
      data: wrapPcmAsWav(data, mimeType),
      mimeType: WAV_MIME_TYPE,
    },
  };
}

function mergeChunkedResponses(
  transcript: string,
  responses: ContentGenerationAudioResponse[]
): ContentGenerationAudioResponse {
  const first = responses[0];
  const referenceMime = first.message.mimeType;
  const buffers: Buffer[] = [];
  let totalDurationMs = 0;
  const usageTotal: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for (const response of responses) {
    const { data, mimeType, durationMs } = response.message;
    if (!data) {
      throw new AppError("Chunked audio synthesis returned a chunk with no data", APP_ERROR_CODES.AUDIO_GEN_NO_DATA);
    }

    if (mimeType !== referenceMime) {
      throw new AppError(
        `Chunked audio synthesis returned inconsistent mime types: ${referenceMime} vs ${mimeType}`,
        APP_ERROR_CODES.VALIDATION
      );
    }

    buffers.push(data);
    totalDurationMs += durationMs ?? 0;
    if (response.usage) {
      usageTotal.promptTokens += response.usage.promptTokens;
      usageTotal.completionTokens += response.usage.completionTokens;
      usageTotal.totalTokens += response.usage.totalTokens;
    }
  }

  const message: AudioMessage = {
    role: MessageRoles.assistant,
    data: Buffer.concat(buffers),
    mimeType: referenceMime,
    sampleRate: first.message.sampleRate,
    durationMs: totalDurationMs > 0 ? totalDurationMs : undefined,
    transcript,
    voice: first.message.voice,
    tokenUsage: usageTotal,
    timestamp: Date.now(),
  };

  return {
    model: first.model,
    modality: CONTENT_MODALITY.AUDIO,
    message,
    finishReason: first.finishReason,
    usage: usageTotal,
  };
}
