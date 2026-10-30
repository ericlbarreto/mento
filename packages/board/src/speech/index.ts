// SpeechPlayer: local mirror of the interface in workstreams/handoffs-and-insights-pipeline.md §2.
// Person 3 implements the voice player; this file owns the text-mode default (`TextSpeechPlayer`).
// `speak` is the clock of the action queue: it resolves when the line is "finished".

export interface SpeechWord {
  word: string;
  start_ms: number;
  end_ms: number;
}

export interface SpeechPlayer {
  /** Resolves when finished, or as soon as `stop()` is called. */
  speak(text: string, opts?: { style?: string; voice?: string }): Promise<void>;
  stop(): void;
  onWord?(cb: (w: SpeechWord) => void): void;
  /** 0..1 output amplitude for the orb. */
  level?(): number;
  // Local additions (optional, so any handoff-§2 player still fits):
  /** 0..1 share of the current line already spoken (for `interrupted.spoken_chars`). */
  progress?(): number;
  pause?(): void;
  resume?(): void;
}

const CHARS_PER_SECOND = 15;
const MIN_MS = 1200;
const MAX_MS = 8000;

/** Reading-time estimate for a caption: ~15 chars/s, clamped to 1.2–8 s. */
export function readingTimeMs(text: string): number {
  return Math.min(MAX_MS, Math.max(MIN_MS, (text.length / CHARS_PER_SECOND) * 1000));
}

/** Text mode: no audio; each line "lasts" its reading time so the board keeps a natural pace. */
export class TextSpeechPlayer implements SpeechPlayer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private finish: (() => void) | null = null;
  private duration = 0;
  /** Time already spent on the current line before the last (re)start. */
  private elapsedBefore = 0;
  private startedAt = 0;
  private paused = false;

  speak(text: string): Promise<void> {
    this.stop();
    this.duration = readingTimeMs(text);
    this.elapsedBefore = 0;
    this.paused = false;
    return new Promise((resolve) => {
      this.finish = () => {
        this.clearTimer();
        this.finish = null;
        resolve();
      };
      this.startTimer();
    });
  }

  stop(): void {
    this.paused = false;
    this.finish?.();
  }

  pause(): void {
    if (!this.finish || this.paused) return;
    this.elapsedBefore += Date.now() - this.startedAt;
    this.paused = true;
    this.clearTimer();
  }

  resume(): void {
    if (!this.finish || !this.paused) return;
    this.paused = false;
    this.startTimer();
  }

  progress(): number {
    if (!this.finish || this.duration === 0) return 0;
    const elapsed = this.elapsedBefore + (this.paused ? 0 : Date.now() - this.startedAt);
    return Math.min(1, elapsed / this.duration);
  }

  /** Gentle pseudo-amplitude from progress: 0 when silent, ~0.35–0.65 while "speaking". */
  level(): number {
    if (!this.finish || this.paused) return 0;
    return 0.5 + 0.15 * Math.sin(this.progress() * Math.PI * 2 * (this.duration / 600));
  }

  private startTimer() {
    this.startedAt = Date.now();
    this.timer = setTimeout(() => this.finish?.(), Math.max(0, this.duration - this.elapsedBefore));
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
