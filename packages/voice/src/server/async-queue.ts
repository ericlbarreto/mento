/** Push-style producer, pull-style consumer. Ends with `end()` or rejects with `fail(err)`. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private error: Error | null = null;
  private ended = false;
  private wake: (() => void) | null = null;

  push(item: T): void {
    this.items.push(item);
    this.notify();
  }
  end(): void {
    this.ended = true;
    this.notify();
  }
  fail(error: Error): void {
    this.error = error;
    this.notify();
  }
  private notify(): void {
    const w = this.wake;
    this.wake = null;
    w?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      if (this.items.length > 0) {
        yield this.items.shift() as T;
        continue;
      }
      if (this.error) throw this.error;
      if (this.ended) return;
      await new Promise<void>((resolve) => (this.wake = resolve));
    }
  }
}
