import type { WordTiming } from "@mento/contracts";

export interface CharTiming {
  char: string;
  start_ms: number;
  end_ms: number;
}

/** ElevenLabs HTTP `with-timestamps` alignment (seconds, parallel arrays). */
export function fromHttpAlignment(a: {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}): CharTiming[] {
  return a.characters.map((char, i) => ({
    char,
    start_ms: Math.round((a.character_start_times_seconds[i] ?? 0) * 1000),
    end_ms: Math.round((a.character_end_times_seconds[i] ?? 0) * 1000),
  }));
}

/** ElevenLabs WebSocket alignment (ms, relative to the chunk) shifted to absolute time. */
export function fromStreamAlignment(
  a: { chars: string[]; charStartTimesMs: number[]; charDurationsMs: number[] },
  offset_ms: number,
): CharTiming[] {
  return a.chars.map((char, i) => {
    const start = offset_ms + (a.charStartTimesMs[i] ?? 0);
    return { char, start_ms: Math.round(start), end_ms: Math.round(start + (a.charDurationsMs[i] ?? 0)) };
  });
}

/** Group characters into words (split on whitespace). Punctuation stays attached to the word. */
export function charsToWords(chars: CharTiming[]): WordTiming[] {
  const words: WordTiming[] = [];
  let current: CharTiming[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    words.push({ word: current.map((c) => c.char).join(""), start_ms: first.start_ms, end_ms: Math.max(last.end_ms, first.start_ms) });
    current = [];
  };
  for (const c of chars) {
    if (/\s/.test(c.char)) flush();
    else current.push(c);
  }
  flush();
  return words;
}

/** Tutor audio is PCM s16le 24 kHz mono: 48 bytes per millisecond. */
export const PCM_BYTES_PER_MS = (24_000 * 2) / 1000;
export const pcmDurationMs = (bytes: number): number => Math.round(bytes / PCM_BYTES_PER_MS);

export interface StreamAlignmentChunk {
  chars: string[];
  charStartTimesMs: number[];
  charDurationsMs: number[];
}

/** ElevenLabs reports times relative to each chunk: shift by the audio already received. */
export class AlignmentAccumulator {
  private offset_ms = 0;
  private readonly chars: CharTiming[] = [];

  push(alignment: StreamAlignmentChunk | undefined, audioBytes: number): CharTiming[] {
    const out = alignment ? fromStreamAlignment(alignment, this.offset_ms) : [];
    this.chars.push(...out);
    this.offset_ms += pcmDurationMs(audioBytes);
    return out;
  }

  all(): CharTiming[] {
    return this.chars;
  }
}
