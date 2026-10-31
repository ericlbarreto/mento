import type { WordTiming } from "@mento/contracts";
import { charsToWords, type CharTiming } from "../alignment";
import type { TtsCache } from "./cache";
import { remapWordTimings, toSpokenText, toSpokenWords } from "./spoken-text";
import type { TtsProvider } from "./types";

export interface SpeakResult {
  words: WordTiming[];
  first_byte_ms: number | null;
  audio_bytes: number;
  cached: boolean;
}

export interface StartSpeakRequest {
  action_id: string;
  text: string;
  previous_text?: string;
  next_text?: string;
}

interface Job {
  chunks: Buffer[];
  done: boolean;
  error: Error | null;
  waiters: Set<() => void>;
  abort: AbortController;
}

export interface TtsServiceOptions {
  provider: TtsProvider;
  cache: TtsCache;
  voiceId: string;
  modelId: string;
  /** How long a finished job stays available for GET /api/tts/:action_id. Default 5 minutes. */
  retainMs?: number;
}

/** One job per `speak`: starts synthesizing at once, streams chunks to whoever asks, caches the result. */
export class TtsService {
  private readonly jobs = new Map<string, Job>();
  constructor(private readonly opts: TtsServiceOptions) {}

  has(action_id: string): boolean {
    return this.jobs.has(action_id);
  }

  cancel(action_id: string): void {
    this.jobs.get(action_id)?.abort.abort();
  }

  cancelAll(): void {
    for (const job of this.jobs.values()) job.abort.abort();
    this.opts.provider.close?.();
  }

  start(req: StartSpeakRequest): Promise<SpeakResult> {
    const job: Job = { chunks: [], done: false, error: null, waiters: new Set(), abort: new AbortController() };
    this.jobs.set(req.action_id, job);
    const wake = () => {
      const ws = [...job.waiters];
      job.waiters.clear();
      for (const w of ws) w();
    };
    const t0 = performance.now();

    // The voice says what a teacher would ("753 antes de Cristo", "x ao quadrado"); the timings are mapped
    // back onto the written words the caption shows. The cache is keyed (and stores timings) by spoken text.
    const spokenWords = toSpokenWords(req.text);
    const spoken = toSpokenText(req.text, spokenWords);

    const run = async (): Promise<SpeakResult> => {
      const { provider, cache, voiceId, modelId } = this.opts;
      const key = cache.key({ text: spoken, voiceId, modelId });
      const hit = await cache.get(key);
      if (hit) {
        job.chunks.push(hit.audio);
        job.done = true;
        wake();
        return { words: remapWordTimings(spokenWords, hit.words), first_byte_ms: 0, audio_bytes: hit.audio.length, cached: true };
      }
      if (job.abort.signal.aborted) {
        job.done = true;
        wake();
        return { words: [], first_byte_ms: null, audio_bytes: 0, cached: false };
      }
      let first: number | null = null;
      const chars: CharTiming[] = [];
      let bytes = 0;
      try {
        for await (const chunk of provider.synthesize({
          text: spoken,
          previous_text: req.previous_text,
          next_text: req.next_text,
          signal: job.abort.signal,
        })) {
          if (first === null) first = Math.round(performance.now() - t0);
          job.chunks.push(chunk.audio);
          bytes += chunk.audio.length;
          chars.push(...chunk.chars);
          wake();
        }
        const words = charsToWords(chars);
        if (!job.abort.signal.aborted && bytes > 0) await cache.put(key, Buffer.concat(job.chunks), words);
        return { words: remapWordTimings(spokenWords, words), first_byte_ms: first, audio_bytes: bytes, cached: false };
      } catch (err) {
        job.error = err instanceof Error ? err : new Error(String(err));
        throw job.error;
      } finally {
        job.done = true;
        wake();
      }
    };

    const result = run();
    result.catch(() => undefined); // errors are reported through the returned promise and stream()
    const retain = setTimeout(() => this.jobs.delete(req.action_id), this.opts.retainMs ?? 5 * 60_000);
    retain.unref?.();
    return result;
  }

  async *stream(action_id: string, signal?: AbortSignal): AsyncGenerator<Buffer> {
    const job = this.jobs.get(action_id);
    if (!job) return;
    let i = 0;
    for (;;) {
      while (i < job.chunks.length) yield job.chunks[i++]!;
      if (job.error) throw job.error;
      if (job.done || signal?.aborted) return;
      await new Promise<void>((resolve) => {
        job.waiters.add(resolve);
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    }
  }
}
