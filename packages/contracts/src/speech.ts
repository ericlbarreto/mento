import { z } from "zod";

/** Time of one spoken word, in ms from the start of that audio. */
export const WordTiming = z
  .object({ word: z.string().min(1), start_ms: z.number().int().min(0), end_ms: z.number().int().min(0) })
  .refine((w) => w.end_ms >= w.start_ms, { message: "end_ms must not be before start_ms", path: ["end_ms"] });
export type WordTiming = z.infer<typeof WordTiming>;

/** Live caption of the student's own speech, produced in the browser by useStt() from Deepgram. */
export const SttCaption = z.object({
  kind: z.enum(["interim", "final"]),
  text: z.string(),
  words: z.array(
    z.object({
      word: z.string().min(1),
      start_ms: z.number().int().min(0),
      end_ms: z.number().int().min(0),
      confidence: z.number().min(0).max(1),
    }),
  ),
  speech_final: z.boolean(),
});
export type SttCaption = z.infer<typeof SttCaption>;

/** Browser audio player for tutor speech. Implemented in @mento/voice/client (Plan 2). */
export interface SpeechPlayer {
  /** Resolves when the audio finished (or was stopped). */
  play(audio_url: string, signal?: AbortSignal): Promise<void>;
  stop(): void;
  /** Subscribe to the words of the current audio as they become due (for captions). */
  onWord(cb: (word: WordTiming) => void): () => void;
  /** Output amplitude 0..1 for the orb. */
  level(): number;
}
