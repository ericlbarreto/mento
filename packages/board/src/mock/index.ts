// Mock data for running the whiteboard without the API (NEXT_PUBLIC_MOCK_API=1). Fictional data only.
import { z } from "zod";
import { type MaterialSummary, type StudentSummary, type TurnRequest, TurnStreamMessage } from "../protocol";
import romeIntro from "../../fixtures/rome-intro.json";
import romeClick27bc from "../../fixtures/rome-click-27bc.json";
import romeWrongAnswer from "../../fixtures/rome-wrong-answer.json";
import romeOutsideMaterial from "../../fixtures/rome-outside-material.json";

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

const Fixture = z.array(TurnStreamMessage);

/** Recorded turn scripts, validated at load so a bad fixture fails loudly. */
export const FIXTURE_TURNS = {
  "rome-intro": Fixture.parse(romeIntro),
  "rome-click-27bc": Fixture.parse(romeClick27bc),
  "rome-wrong-answer": Fixture.parse(romeWrongAnswer),
  "rome-outside-material": Fixture.parse(romeOutsideMaterial),
} satisfies Record<string, TurnStreamMessage[]>;
export type FixtureName = keyof typeof FIXTURE_TURNS;

/** Picks the mock reply for a turn: first turn → intro; board click → 27 a.C.; answer → wrong-answer hint (in that order); else → outside material. */
export function pickFixture(req: TurnRequest, turnIndex: number): FixtureName {
  if (turnIndex === 0) return "rome-intro";
  if (req.appended.some((a) => a.name === "user_message" && a.kind === "board_select")) return "rome-click-27bc";
  if (req.appended.some((a) => a.name === "answer_submit")) return "rome-wrong-answer";
  return "rome-outside-material";
}

/**
 * Replays a recorded turn with realistic timing (~1.2 s to the first action, 150–400 ms gaps,
 * ~2.5 s before a draw_result). Stops quietly (no throw) as soon as `signal` aborts.
 */
export async function* replayFixture(
  messages: readonly TurnStreamMessage[],
  signal?: AbortSignal,
): AsyncGenerator<TurnStreamMessage> {
  let firstAction = true;
  for (const msg of messages) {
    let wait = 150 + Math.random() * 250;
    if ("turn_id" in msg) wait = 0;
    else if ("action" in msg && firstAction) wait = 1200;
    else if ("action" in msg && msg.action.name === "draw_result") wait = 2500;
    if ("action" in msg) firstAction = false;
    if (!(await abortableDelay(wait, signal))) return;
    yield msg;
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
