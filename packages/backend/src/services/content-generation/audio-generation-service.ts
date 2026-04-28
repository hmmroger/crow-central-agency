import { container } from "../../container.js";
import { isPcmMime, wrapPcmAsWav, WAV_MIME_TYPE } from "./audio-format.js";
import type { AudioGenerationOptions, ContentGenerationAudioResponse } from "./content-generation.types.js";

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
  "### TRANSCRIPT",
].join("\n");

export async function audioGeneration(
  model: string,
  text: string,
  options?: AudioGenerationOptions
): Promise<ContentGenerationAudioResponse> {
  const provider = options?.provider ?? container.audioGenProvider;
  const response = await provider.synthesizeAudio(model, text, {
    ...options,
    stylePrompt: options?.stylePrompt ?? DEFAULT_STYLE_PROMPT,
  });

  return normalizeAudioResponse(response);
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
