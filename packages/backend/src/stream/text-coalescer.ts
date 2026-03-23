/**
 * Buffers consecutive text deltas and flushes them as a single text event.
 * Flushes on non-text event or when flush() is called explicitly.
 */
export class TextCoalescer {
  private buffer = "";
  private flushCallback: (text: string) => void;

  constructor(onFlush: (text: string) => void) {
    this.flushCallback = onFlush;
  }

  /** Append a text delta to the buffer */
  append(text: string): void {
    this.buffer += text;
  }

  /** Flush the buffer if it has content */
  flush(): void {
    if (this.buffer.length > 0) {
      this.flushCallback(this.buffer);
      this.buffer = "";
    }
  }

  /** Check if there is buffered content */
  hasContent(): boolean {
    return this.buffer.length > 0;
  }
}
