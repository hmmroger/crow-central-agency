import { toDocumentUid, type DocumentRef } from "@crow-central-agency/shared";

/** Keeps live-event reads per document in order: a read overtaken by a later one, or cancelled by a removal, is dropped. */
export class LatestReadTracker {
  private readonly generationByUid = new Map<string, number>();
  private nextGeneration = 0;

  /** Runs the read and returns its result, or undefined when a later read or a cancel for the same document came in meanwhile */
  public async readLatest<T>(ref: DocumentRef, read: () => Promise<T | undefined>): Promise<T | undefined> {
    const uid = toDocumentUid(ref);
    const generation = ++this.nextGeneration;
    this.generationByUid.set(uid, generation);
    const result = await read();
    if (this.generationByUid.get(uid) !== generation) {
      return undefined;
    }

    this.generationByUid.delete(uid);
    return result;
  }

  public cancel(ref: DocumentRef): void {
    this.generationByUid.delete(toDocumentUid(ref));
  }
}
