// Mock data for running the whiteboard without the API (NEXT_PUBLIC_MOCK_API=1). Fictional data only.
import { FixtureTurn, type MaterialSummary, type StreamMessage, type StudentSummary, type TurnRequest } from "../protocol";
import romeIntro from "../../fixtures/rome-intro.json";
import clickAndAsk from "../../fixtures/click-and-ask.json";
import wrongAnswer from "../../fixtures/wrong-answer.json";
import outsideMaterial from "../../fixtures/outside-material.json";

/** Id of the demo book; the fixtures cite it. */
export const MOCK_MATERIAL_ID = "665f1a2b3c4d5e6f7a8b9c01";

export const MOCK_STUDENTS: StudentSummary[] = [
  { id: "665f1a2b3c4d5e6f7a8b9d01", name: "Ana S." },
  { id: "665f1a2b3c4d5e6f7a8b9d02", name: "Bruno L." },
  { id: "665f1a2b3c4d5e6f7a8b9d03", name: "Carla M." },
  { id: "665f1a2b3c4d5e6f7a8b9d04", name: "Diego R." },
];

export const MOCK_MATERIALS: MaterialSummary[] = [
  { id: MOCK_MATERIAL_ID, title: "História — Roma Antiga (livro de demonstração)", subject: "História", pages: 48, status: "ready" },
  { id: "665f1a2b3c4d5e6f7a8b9c02", title: "História — Grécia Antiga (apostila)", subject: "História", pages: 32, status: "processing" },
  { id: "665f1a2b3c4d5e6f7a8b9c03", title: "Geografia — Clima (digitalizado)", subject: "Geografia", pages: 20, status: "failed" },
];

/** Recorded turns (same format as Person 3's fixtures/turns), validated at load so a bad fixture fails loudly. */
export const FIXTURE_TURNS = {
  "rome-intro": FixtureTurn.parse(romeIntro),
  "click-and-ask": FixtureTurn.parse(clickAndAsk),
  "wrong-answer": FixtureTurn.parse(wrongAnswer),
  "outside-material": FixtureTurn.parse(outsideMaterial),
} satisfies Record<string, FixtureTurn>;
export type FixtureName = keyof typeof FIXTURE_TURNS;

/**
 * Picks the mock reply: opening turn (no message, or the first turn) → rome-intro; board click → click-and-ask;
 * answer to a verification → wrong-answer (in that order); otherwise → outside-material.
 */
export function pickFixture(req: TurnRequest, turnIndex: number): FixtureName {
  if (turnIndex === 0 || req.appended.length === 0) return "rome-intro";
  if (req.appended.some((a) => a.name === "user_message" && a.kind === "board_select")) return "click-and-ask";
  if (req.appended.some((a) => a.name === "verification_answer")) return "wrong-answer";
  return "outside-material";
}

/**
 * Replays a recorded turn, yielding each message `at_ms` after the replay started.
 * Stops quietly (returns, never throws) as soon as `signal` aborts.
 */
export async function* replayFixture(name: FixtureName, opts: { signal?: AbortSignal } = {}): AsyncGenerator<StreamMessage> {
  const start = Date.now();
  for (const { at_ms, message } of FIXTURE_TURNS[name].messages) {
    if (!(await abortableDelay(Math.max(0, at_ms - (Date.now() - start)), opts.signal))) return;
    yield message;
  }
}

/** Resolves true after `ms`, or false as soon as `signal` aborts. */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
