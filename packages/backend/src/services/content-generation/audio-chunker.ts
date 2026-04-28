const PARAGRAPH_SEPARATOR = "\n\n";
const SENTENCE_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "sentence" });

/**
 * Split text into chunks bounded by `maxChars`. Chunks are packed greedily
 * on paragraph boundaries (`\n\n`) — a chunk holds as many full paragraphs
 * as fit under the budget. A paragraph longer than `maxChars` is sentence-
 * split via `Intl.Segmenter` and emitted as its own chunks; it never merges
 * with neighboring paragraphs.
 */
export function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const paragraphs = text.split(PARAGRAPH_SEPARATOR).filter((paragraph) => paragraph.length > 0);
  const chunks: string[] = [];
  let currentParts: string[] = [];
  let currentLen = 0;

  const flush = () => {
    if (currentParts.length > 0) {
      chunks.push(currentParts.join(PARAGRAPH_SEPARATOR));
      currentParts = [];
      currentLen = 0;
    }
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      chunks.push(...packSentences(paragraph, maxChars));
      continue;
    }

    const separatorLen = currentParts.length > 0 ? PARAGRAPH_SEPARATOR.length : 0;
    const wouldOverflow = currentLen + separatorLen + paragraph.length > maxChars;

    if (currentParts.length > 0 && wouldOverflow) {
      flush();
    }

    if (currentParts.length > 0) {
      currentLen += PARAGRAPH_SEPARATOR.length;
    }

    currentParts.push(paragraph);
    currentLen += paragraph.length;
  }

  flush();
  return chunks;
}

function packSentences(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const sentences = Array.from(SENTENCE_SEGMENTER.segment(text), (segment) => segment.segment);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length === 0) {
      current = sentence;
      continue;
    }

    if (current.length + sentence.length > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}
