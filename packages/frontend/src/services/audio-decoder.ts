/**
 * Decode raw PCM audio bytes into per-channel Float32 sample arrays.
 * Supports 8/16/24/32-bit signed little-endian PCM (8-bit is unsigned per WAV convention).
 */
const SUPPORTED_BIT_DEPTHS = new Set([8, 16, 24, 32]);
const PCM_8BIT_OFFSET = 128;
const PCM_8BIT_SCALE = 128;
const PCM_16BIT_SCALE = 32768;
const PCM_24BIT_SCALE = 8388608;
const PCM_32BIT_SCALE = 2147483648;
const BITS_PER_BYTE = 8;

export interface PcmFormat {
  sampleRate: number;
  bitDepth: number;
  channels: number;
}

export function decodePcm(buffer: ArrayBuffer, format: PcmFormat): Float32Array[] {
  if (!SUPPORTED_BIT_DEPTHS.has(format.bitDepth)) {
    throw new Error(`Unsupported PCM bit depth: ${format.bitDepth}`);
  }

  const bytesPerSample = format.bitDepth / BITS_PER_BYTE;
  const bytesPerFrame = bytesPerSample * format.channels;
  const totalFrames = Math.floor(buffer.byteLength / bytesPerFrame);
  const view = new DataView(buffer);
  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < format.channels; channel++) {
    channelData.push(new Float32Array(totalFrames));
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    for (let channel = 0; channel < format.channels; channel++) {
      const offset = frame * bytesPerFrame + channel * bytesPerSample;
      channelData[channel][frame] = readSample(view, offset, format.bitDepth);
    }
  }

  return channelData;
}

function readSample(view: DataView, offset: number, bitDepth: number): number {
  if (bitDepth === 8) {
    return (view.getUint8(offset) - PCM_8BIT_OFFSET) / PCM_8BIT_SCALE;
  }

  if (bitDepth === 16) {
    return view.getInt16(offset, true) / PCM_16BIT_SCALE;
  }

  if (bitDepth === 24) {
    const lo = view.getUint8(offset);
    const mid = view.getUint8(offset + 1);
    const hi = view.getInt8(offset + 2);
    const intVal = (hi << 16) | (mid << 8) | lo;

    return intVal / PCM_24BIT_SCALE;
  }

  return view.getInt32(offset, true) / PCM_32BIT_SCALE;
}
