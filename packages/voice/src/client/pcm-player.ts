import type { SpeechPlayer, WordTiming } from "@mento/contracts";
import { pcm16ToFloat32 } from "./pcm";

const SAMPLE_RATE = 24000;

/**
 * Plays the chunked PCM of one `speak` as it downloads (Web Audio), fires word callbacks from the
 * alignment (`setWords`) and exposes the output level for the orb.
 */
export class PcmPlayer implements SpeechPlayer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private listeners = new Set<(w: WordTiming) => void>();
  private words: WordTiming[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private controller: AbortController | null = null;

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Word timings of the audio that is playing (from the `speech_alignment` message); may arrive late. */
  setWords(words: WordTiming[]): void {
    this.words = words;
    if (this.startedAt !== null) this.scheduleWords(this.startedAt);
  }
  private startedAt: number | null = null;

  private scheduleWords(startedAtMs: number): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    for (const w of this.words) {
      const delay = Math.max(0, startedAtMs + w.start_ms - performance.now());
      this.timers.push(setTimeout(() => this.listeners.forEach((cb) => cb(w)), delay));
    }
  }

  async play(audio_url: string, signal?: AbortSignal): Promise<void> {
    const ctx = this.ensure();
    await ctx.resume();
    this.stop();
    const controller = new AbortController();
    this.controller = controller;
    signal?.addEventListener("abort", () => controller.abort(), { once: true });

    const res = await fetch(audio_url, { signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(`audio fetch failed: HTTP ${res.status}`);
    const reader = res.body.getReader();

    let nextTime = ctx.currentTime + 0.05;
    this.startedAt = null;
    let leftover = new Uint8Array(0);
    let lastSource: AudioBufferSourceNode | null = null;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const merged = new Uint8Array(leftover.length + value.length);
        merged.set(leftover);
        merged.set(value, leftover.length);
        const usable = merged.length - (merged.length % 2);
        leftover = merged.slice(usable);
        if (usable === 0) continue;

        const samples = pcm16ToFloat32(merged.subarray(0, usable));
        const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
        buffer.copyToChannel(samples, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.analyser!);
        source.start(nextTime);
        if (this.startedAt === null) {
          this.startedAt = performance.now() + (nextTime - ctx.currentTime) * 1000;
          this.scheduleWords(this.startedAt);
        }
        nextTime += buffer.duration;
        this.sources.add(source);
        source.onended = () => this.sources.delete(source);
        lastSource = source;
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      throw err;
    }

    if (lastSource) await new Promise<void>((resolve) => ((lastSource as AudioBufferSourceNode).onended = () => resolve()));
  }

  stop(): void {
    this.controller?.abort();
    this.controller = null;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.startedAt = null;
  }

  onWord(cb: (word: WordTiming) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  level(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / data.length) * 3);
  }
}
