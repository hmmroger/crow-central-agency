const PARAGRAPH_SEPARATOR = "\n\n";
const SENTENCE_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "sentence" });

const SECONDS_PER_CHAR_CJK = 0.2;
const SECONDS_PER_CHAR_DEFAULT = 0.06;

export interface ChunkBudget {
  maxChars: number;
  maxSeconds: number;
}

/**
 * Split text into chunks bounded by both `budget.maxChars` and
 * `budget.maxSeconds`. Per-char duration is estimated as 0.20s for CJK
 * characters (Han, Hiragana, Katakana, Hangul) and 0.06s otherwise, so dense
 * scripts like Chinese and Japanese close earlier than Latin scripts at the
 * same character count. Chunks are packed greedily on paragraph boundaries
 * (`\n\n`); a paragraph that exceeds either budget is sentence-split via
 * `Intl.Segmenter` and never merges with neighboring paragraphs.
 */
export function chunkText(text: string, budget: ChunkBudget): string[] {
  if (fits(text, budget)) {
    return [text];
  }

  const paragraphs = text.split(PARAGRAPH_SEPARATOR).filter((paragraph) => paragraph.length > 0);
  const chunks: string[] = [];
  let currentParts: string[] = [];
  let currentChars = 0;
  let currentSeconds = 0;

  const flush = () => {
    if (currentParts.length > 0) {
      chunks.push(currentParts.join(PARAGRAPH_SEPARATOR));
      currentParts = [];
      currentChars = 0;
      currentSeconds = 0;
    }
  };

  for (const paragraph of paragraphs) {
    if (!fits(paragraph, budget)) {
      flush();
      chunks.push(...packSentences(paragraph, budget));
      continue;
    }

    const separatorChars = currentParts.length > 0 ? PARAGRAPH_SEPARATOR.length : 0;
    const separatorSeconds = separatorChars * SECONDS_PER_CHAR_DEFAULT;
    const paragraphSeconds = estimateSeconds(paragraph);
    const wouldOverflow =
      currentChars + separatorChars + paragraph.length > budget.maxChars ||
      currentSeconds + separatorSeconds + paragraphSeconds > budget.maxSeconds;

    if (currentParts.length > 0 && wouldOverflow) {
      flush();
    }

    if (currentParts.length > 0) {
      currentChars += PARAGRAPH_SEPARATOR.length;
      currentSeconds += PARAGRAPH_SEPARATOR.length * SECONDS_PER_CHAR_DEFAULT;
    }

    currentParts.push(paragraph);
    currentChars += paragraph.length;
    currentSeconds += paragraphSeconds;
  }

  flush();
  return chunks.length > 0 ? chunks : [text];
}

function packSentences(text: string, budget: ChunkBudget): string[] {
  if (fits(text, budget)) {
    return [text];
  }

  const sentences = Array.from(SENTENCE_SEGMENTER.segment(text), (segment) => segment.segment);
  const chunks: string[] = [];
  let current = "";
  let currentSeconds = 0;

  for (const sentence of sentences) {
    const sentenceSeconds = estimateSeconds(sentence);
    if (current.length === 0) {
      current = sentence;
      currentSeconds = sentenceSeconds;
      continue;
    }

    const wouldOverflow =
      current.length + sentence.length > budget.maxChars || currentSeconds + sentenceSeconds > budget.maxSeconds;

    if (wouldOverflow) {
      chunks.push(current);
      current = sentence;
      currentSeconds = sentenceSeconds;
    } else {
      current += sentence;
      currentSeconds += sentenceSeconds;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function fits(text: string, budget: ChunkBudget): boolean {
  return text.length <= budget.maxChars && estimateSeconds(text) <= budget.maxSeconds;
}

function estimateSeconds(text: string): number {
  let seconds = 0;

  for (const char of text) {
    seconds += isCjkChar(char) ? SECONDS_PER_CHAR_CJK : SECONDS_PER_CHAR_DEFAULT;
  }

  return seconds;
}

function isCjkChar(char: string): boolean {
  const code = char.codePointAt(0);

  if (code === undefined) {
    return false;
  }

  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x20000 && code <= 0x2a6df) || // CJK Extension B
    (code >= 0x3040 && code <= 0x309f) || // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) || // Katakana
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) // CJK Compatibility Ideographs
  );
}
