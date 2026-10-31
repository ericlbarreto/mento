import { describe, expect, it } from "vitest";
import { DeepgramCaptionBuilder } from "./deepgram-parse";

const results = (words: string[], opts: { is_final: boolean; speech_final: boolean; start?: number }) => ({
  type: "Results",
  is_final: opts.is_final,
  speech_final: opts.speech_final,
  channel: {
    alternatives: [
      {
        transcript: words.join(" "),
        confidence: 0.95,
        words: words.map((w, i) => ({
          word: w.toLowerCase().replace(/[.,?!]/g, ""),
          punctuated_word: w,
          start: (opts.start ?? 0) + i * 0.3,
          end: (opts.start ?? 0) + i * 0.3 + 0.25,
          confidence: 0.9,
        })),
      },
    ],
  },
});

describe("DeepgramCaptionBuilder", () => {
  it("emits interim captions that include earlier finals, then one final caption at speech_final", () => {
    const b = new DeepgramCaptionBuilder();
    const e1 = b.handle(results(["Quem"], { is_final: false, speech_final: false }));
    expect(e1).toEqual([{ type: "caption", caption: expect.objectContaining({ kind: "interim", text: "Quem", speech_final: false }) }]);

    const e2 = b.handle(results(["Quem", "foi"], { is_final: true, speech_final: false }));
    expect(e2[0]).toMatchObject({ type: "caption", caption: { kind: "interim", text: "Quem foi" } });

    const e3 = b.handle(results(["Augusto?"], { is_final: false, speech_final: false, start: 1 }));
    expect(e3[0]).toMatchObject({ caption: { kind: "interim", text: "Quem foi Augusto?" } });

    const e4 = b.handle(results(["Augusto?"], { is_final: true, speech_final: true, start: 1 }));
    expect(e4).toHaveLength(1);
    const final = (e4[0] as { type: "caption"; caption: { kind: string; text: string; speech_final: boolean; words: { word: string; start_ms: number }[] } }).caption;
    expect(final).toMatchObject({ kind: "final", text: "Quem foi Augusto?", speech_final: true });
    expect(final.words.map((w) => w.word)).toEqual(["Quem", "foi", "Augusto?"]);
    expect(final.words[2]?.start_ms).toBe(1000);

    // the next utterance starts clean
    const e5 = b.handle(results(["Oi"], { is_final: true, speech_final: true }));
    expect(e5[0]).toMatchObject({ caption: { kind: "final", text: "Oi" } });
  });

  it("maps SpeechStarted and uses UtteranceEnd as the fallback end of turn", () => {
    const b = new DeepgramCaptionBuilder();
    expect(b.handle({ type: "SpeechStarted" })).toEqual([{ type: "speech_started" }]);
    b.handle(results(["Não", "entendi"], { is_final: true, speech_final: false }));
    const end = b.handle({ type: "UtteranceEnd", last_word_end: 0.6 });
    expect(end[0]).toMatchObject({ caption: { kind: "final", text: "Não entendi", speech_final: true } });
    expect(b.handle({ type: "UtteranceEnd" })).toEqual([]); // nothing pending
  });

  it("ignores empty transcripts and unknown messages", () => {
    const b = new DeepgramCaptionBuilder();
    expect(b.handle(results([], { is_final: true, speech_final: false }))).toEqual([]);
    expect(b.handle({ type: "Metadata" })).toEqual([]);
    expect(b.handle("not an object")).toEqual([]);
  });
});
