import { z } from "zod";
import { AGENT_TASK_SOURCE_TYPE, ARTIFACT_CONTENT_TYPE } from "@crow-central-agency/shared";
import { env } from "../../config/env.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import { audioGeneration } from "../../services/content-generation/audio-generation-service.js";
import type { VoiceConfig } from "../../services/content-generation/content-generation.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const GENERATE_AUDIO_TOOL_NAME = "generate_audio";

// single speaker use agent's custom voice or default voice
const DEFAULT_MULTI_SPEAKER_MALE_1 = "Umbriel";
const DEFAULT_MULTI_SPEAKER_FEMALE_1 = "Autonoe";
const DEFAULT_MULTI_SPEAKER_MALE_2 = "Achird";
const DEFAULT_MULTI_SPEAKER_FEMALE_2 = "Leda";

const SPEAKER_GENDER_MALE = "male";
const SPEAKER_GENDER_FEMALE = "female";

const AUDIO_FILE_EXTENSION = ".wav";

type SpeakerGender = typeof SPEAKER_GENDER_MALE | typeof SPEAKER_GENDER_FEMALE;
type SpeakerSlot = 1 | 2;

interface VoiceResolutionInput {
  speakerName?: string;
  speakerGender?: SpeakerGender;
  additionalSpeakerName?: string;
  additionalSpeakerGender?: SpeakerGender;
}

export function getGenerateAudioToolConfig(agentId: string, registry: AgentRegistry, artifactManager: ArtifactManager) {
  const inputSchema = {
    directionalPrompt: z
      .string()
      .describe(
        `This prompt should include audio profile for each speaker (specified in speakerName and additionalSpeakerName) (## AUDIO PROFILE), setting the scene (## SCENE), and director's notes (## DIRECTOR'S NOTES). Audio profile for each speaker should be under a section with format "## AUDIO PROFILE: {speakerName}" then follow by audio profile of the speaker.`
      ),
    transcript: z
      .string()
      .describe(`The script for generating audio. Prefix sentence with "speakerName:" if having multiple speakers.`),
    speakerName: z.string().optional().describe("Optional, this is used when the script is calling for two speakers."),
    speakerGender: z
      .enum([SPEAKER_GENDER_MALE, SPEAKER_GENDER_FEMALE])
      .optional()
      .describe("Optional gender for the primary speaker; used to select a default voice for multi-speaker scenes."),
    additionalSpeakerName: z
      .string()
      .optional()
      .describe("Optional second speaker label. Required (alongside speakerName) to enable multi-speaker synthesis."),
    additionalSpeakerGender: z
      .enum([SPEAKER_GENDER_MALE, SPEAKER_GENDER_FEMALE])
      .optional()
      .describe("Optional gender for the second speaker; used to select a default voice for multi-speaker scenes."),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const model = env.AUDIO_GENERATION_MODEL;
      if (!model) {
        throw new AppError("Audio generation model is not configured", APP_ERROR_CODES.NOT_SUPPORTED);
      }

      const agentVoiceName = registry.getAgent(agentId).agentVoiceConfig?.voiceName;
      const voices = resolveVoices(args, agentVoiceName);

      const response = await audioGeneration(model, args.transcript, {
        stylePrompt: args.directionalPrompt,
        voice: voices,
      });

      const audioData = response.message.data;
      if (!audioData) {
        throw new AppError("Audio generation returned no data", APP_ERROR_CODES.AUDIO_GEN_NO_DATA);
      }

      const filename = `audio-${Date.now()}${AUDIO_FILE_EXTENSION}`;
      const metadata = await artifactManager.writeArtifact(agentId, filename, audioData, {
        contentType: ARTIFACT_CONTENT_TYPE.AUDIO,
        createdBy: { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId },
      });

      const durationMs = response.message.durationMs;
      const durationLabel = durationMs !== undefined ? `${durationMs} ms` : "unknown duration";
      return textToolResult([
        `Audio generated and saved as artifact: ${metadata.filename} (${durationLabel}, ${audioData.byteLength} bytes)`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to generate audio.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GENERATE_AUDIO_TOOL_NAME,
    description:
      "Synthesize speech audio from a transcript. Supports single- or two-speaker scenes — pass both speakerName and additionalSpeakerName to enable multi-speaker synthesis. The result is written as an audio artifact in the agent's folder.",
    inputSchema,
    handler,
  };

  return config;
}

function resolveVoices(input: VoiceResolutionInput, agentVoiceName: string | undefined): VoiceConfig[] {
  const { speakerName, speakerGender, additionalSpeakerName, additionalSpeakerGender } = input;

  if (speakerName && additionalSpeakerName) {
    return [
      { speakerName, voice: pickVoice(speakerGender, 1) },
      { speakerName: additionalSpeakerName, voice: pickVoice(additionalSpeakerGender, 2) },
    ];
  }

  return [{ voice: agentVoiceName }];
}

function pickVoice(gender: SpeakerGender | undefined, slot: SpeakerSlot): string {
  if (gender === SPEAKER_GENDER_MALE) {
    return slot === 1 ? DEFAULT_MULTI_SPEAKER_MALE_1 : DEFAULT_MULTI_SPEAKER_MALE_2;
  }

  if (gender === SPEAKER_GENDER_FEMALE) {
    return slot === 1 ? DEFAULT_MULTI_SPEAKER_FEMALE_1 : DEFAULT_MULTI_SPEAKER_FEMALE_2;
  }

  return slot === 1 ? DEFAULT_MULTI_SPEAKER_MALE_1 : DEFAULT_MULTI_SPEAKER_FEMALE_1;
}
