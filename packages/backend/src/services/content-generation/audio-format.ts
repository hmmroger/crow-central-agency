export interface PcmFormat {
  sampleRate: number;
  bitDepth: number;
  channels: number;
}

export const WAV_MIME_TYPE = "audio/wav";

const PCM_MIME_PATTERN = /^audio\/(?:L\d+|pcm|x-raw)/i;
const SAMPLE_RATE_PATTERN = /rate=(\d+)/i;
const CHANNELS_PATTERN = /channels=(\d+)/i;
const BIT_DEPTH_PATTERN = /audio\/L(\d+)/i;

const DEFAULT_PCM_SAMPLE_RATE = 24000;
const DEFAULT_PCM_BIT_DEPTH = 16;
const DEFAULT_PCM_CHANNELS = 1;
const BITS_PER_BYTE = 8;

const WAV_HEADER_SIZE = 44;
const WAV_FMT_CHUNK_SIZE = 16;
const WAV_FORMAT_PCM = 1;

export function isPcmMime(mimeType: string | undefined): boolean {
  if (!mimeType) {
    return false;
  }

  return PCM_MIME_PATTERN.test(mimeType);
}

export function parsePcmFormat(mimeType: string | undefined): PcmFormat {
  const rateMatch = mimeType?.match(SAMPLE_RATE_PATTERN);
  const channelsMatch = mimeType?.match(CHANNELS_PATTERN);
  const bitDepthMatch = mimeType?.match(BIT_DEPTH_PATTERN);

  return {
    sampleRate: rateMatch ? Number(rateMatch[1]) : DEFAULT_PCM_SAMPLE_RATE,
    bitDepth: bitDepthMatch ? Number(bitDepthMatch[1]) : DEFAULT_PCM_BIT_DEPTH,
    channels: channelsMatch ? Number(channelsMatch[1]) : DEFAULT_PCM_CHANNELS,
  };
}

/**
 * Wrap raw PCM bytes in a 44-byte WAV (RIFF/WAVE) header so downstream
 * consumers can treat the buffer as a self-describing audio file.
 */
export function wrapPcmAsWav(pcmData: Buffer, mimeType: string | undefined): Buffer {
  const { sampleRate, bitDepth, channels } = parsePcmFormat(mimeType);
  const bytesPerSample = bitDepth / BITS_PER_BYTE;
  const byteRate = sampleRate * channels * bytesPerSample;
  const blockAlign = channels * bytesPerSample;
  const dataSize = pcmData.byteLength;

  const header = Buffer.alloc(WAV_HEADER_SIZE);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(WAV_HEADER_SIZE - 8 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(WAV_FMT_CHUNK_SIZE, 16);
  header.writeUInt16LE(WAV_FORMAT_PCM, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
