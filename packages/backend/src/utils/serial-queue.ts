/** Runs async operations one at a time, in call order; a failed operation does not stop the ones after it. */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  public run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    this.tail = next.then(
      () => undefined,
      () => undefined
    );

    return next;
  }
}
