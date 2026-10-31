import type { SttCaption } from "@mento/contracts";

export type SttWord = SttCaption["words"][number];
export type SttEvent = { type: "caption"; caption: SttCaption } | { type: "speech_started" };

interface DgWord {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  confidence: number;
}

const toWord = (w: DgWord): SttWord => ({
  word: w.punctuated_word ?? w.word,
  start_ms: Math.round(w.start * 1000),
  end_ms: Math.round(w.end * 1000),
  confidence: w.confidence,
});

const caption = (kind: SttCaption["kind"], words: SttWord[], speech_final: boolean): SttEvent => ({
  type: "caption",
  caption: { kind, text: words.map((w) => w.word).join(" "), words, speech_final },
});

/**
 * Turns Deepgram live messages into captions. Finalized segments accumulate until the turn ends
 * (`speech_final`, or `UtteranceEnd` as the fallback), so every caption shows the whole utterance so far.
 */
export class DeepgramCaptionBuilder {
  private finals: SttWord[] = [];

  handle(message: unknown): SttEvent[] {
    if (typeof message !== "object" || message === null) return [];
    const m = message as Record<string, unknown>;

    if (m.type === "SpeechStarted") return [{ type: "speech_started" }];

    if (m.type === "UtteranceEnd") {
      if (this.finals.length === 0) return [];
      const words = this.finals;
      this.finals = [];
      return [caption("final", words, true)];
    }

    if (m.type !== "Results") return [];
    const alt = (m.channel as { alternatives?: { words?: DgWord[] }[] } | undefined)?.alternatives?.[0];
    const words = (alt?.words ?? []).map(toWord);
    if (words.length === 0) return [];

    if (m.is_final === true) {
      this.finals.push(...words);
      if (m.speech_final === true) {
        const all = this.finals;
        this.finals = [];
        return [caption("final", all, true)];
      }
      return [caption("interim", [...this.finals], false)];
    }
    return [caption("interim", [...this.finals, ...words], false)];
  }
}
