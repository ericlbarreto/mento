// Side channel between the action queue and the board's handwriting (no board state): the queue asks the board to
// finish (settle), pause or resume its animations, and waits for them before a turn ends or a question opens.

export type AnimationSignal = "settle" | "pause" | "resume";

export interface AnimationBus {
  /** Finish every running and queued animation now (interrupt, new turn). */
  settle(): void;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  /** True while the board is writing or drawing (set by the board). */
  isBusy(): boolean;
  setBusy(busy: boolean): void;
  /** Resolves when nothing is being written (at once when idle). */
  whenIdle(): Promise<void>;
  subscribe(listener: (signal: AnimationSignal) => void): () => void;
}

export function createAnimationBus(): AnimationBus {
  const listeners = new Set<(signal: AnimationSignal) => void>();
  let paused = false;
  let busy = false;
  let waiters: (() => void)[] = [];
  const emit = (s: AnimationSignal) => listeners.forEach((l) => l(s));
  return {
    settle: () => emit("settle"),
    setPaused(p) {
      if (p === paused) return;
      paused = p;
      emit(p ? "pause" : "resume");
    },
    isPaused: () => paused,
    isBusy: () => busy,
    setBusy(b) {
      busy = b;
      if (b) return;
      const w = waiters;
      waiters = [];
      w.forEach((r) => r());
    },
    whenIdle: () => (busy ? new Promise<void>((r) => waiters.push(r)) : Promise.resolve()),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
