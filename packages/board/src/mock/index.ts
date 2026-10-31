// Mock data for running the whiteboard without the API (NEXT_PUBLIC_MOCK_API=1). Fictional data only.
// Turns replay the repo's recorded fixtures (fixtures/turns, Person 3), the same files GET /api/dev/fixture-turn serves.
import { FixtureTurn, type StreamMessage, type SubjectSummary } from "@mento/contracts";
import { z } from "zod";
import romeIntro from "../../../../fixtures/turns/rome-intro.json";
import clickAndAsk from "../../../../fixtures/turns/click-and-ask.json";

/** Student as the start screen shows it. Local until Person 1's students contract lands (PR #7). */
export const StudentSummary = z.object({ id: z.string().min(1), name: z.string().min(1), is_simulated: z.boolean().optional() });
export type StudentSummary = z.infer<typeof StudentSummary>;

/** The pre-set demo student (first of MOCK_STUDENTS). */
export const DEMO_STUDENT_ID = "demo-ana";

export const MOCK_STUDENTS: StudentSummary[] = [
  { id: DEMO_STUDENT_ID, name: "Ana S." },
  { id: "665f1a2b3c4d5e6f7a8b9d02", name: "Bruno L." },
  { id: "665f1a2b3c4d5e6f7a8b9d03", name: "Carla M." },
  { id: "665f1a2b3c4d5e6f7a8b9d04", name: "Diego R." },
];

/** Id of the demo book; the fixtures cite it. */
export const MOCK_MATERIAL_ID = "6650f0c2a1b2c3d4e5f60718";

export const MOCK_SUBJECTS: SubjectSummary[] = [
  {
    id: "665f1a2b3c4d5e6f7a8b9a01",
    name: "História",
    key: "history",
    material_count: 1,
    materials: [{ id: MOCK_MATERIAL_ID, title: "História — Roma Antiga (livro de demonstração)", pages: 48, status: "ready" }],
  },
];

/** Recorded turns, validated at load so a bad fixture fails loudly. */
export const FIXTURE_TURNS = {
  "rome-intro": FixtureTurn.parse(romeIntro),
  "click-and-ask": FixtureTurn.parse(clickAndAsk),
} satisfies Record<string, FixtureTurn>;
export type FixtureName = keyof typeof FIXTURE_TURNS;

/**
 * Picks the mock reply for the `turnIndex`-th turn of a session: rome-intro, then click-and-ask (which builds on
 * rome-intro's timeline), and again. `round` numbers each pair so `namespaceFixtureMessage` keeps ids unique.
 */
export function pickFixture(turnIndex: number): { name: FixtureName; round: number } {
  return { name: turnIndex % 2 === 0 ? "rome-intro" : "click-and-ask", round: Math.floor(turnIndex / 2) };
}

/**
 * Fixtures reuse the same element, action, verification and turn ids on every replay. From round 1 on, suffix
 * them with `_r<round>` so a replayed fixture adds new elements instead of colliding with the earlier ones.
 * `audio_url` is left as given.
 */
export function namespaceFixtureMessage(message: StreamMessage, round: number): StreamMessage {
  if (round <= 0) return message;
  const ns = (id: string) => `${id}_r${round}`;
  switch (message.type) {
    case "action": {
      const args: Record<string, unknown> = { ...message.action.args };
      for (const key of ["id", "target_id", "element_id", "verification_id"]) {
        const value = args[key];
        if (typeof value === "string") args[key] = ns(value);
      }
      return { ...message, action: { ...message.action, id: ns(message.action.id), args } as typeof message.action };
    }
    case "svg_chunk":
      return { ...message, element_id: ns(message.element_id) };
    case "speech_alignment":
      return { ...message, action_id: ns(message.action_id) };
    case "script_done":
    case "turn_done":
      return { ...message, turn_id: ns(message.turn_id) };
    case "error":
      return message;
  }
}

export interface ReplayOptions {
  signal?: AbortSignal;
  /** Multiplies the recorded delays (1 = as recorded, 0 = instant). */
  speed?: number;
  /** See namespaceFixtureMessage. */
  round?: number;
}

/**
 * Replays a recorded turn, yielding each message `at_ms × speed` after the replay started.
 * Stops quietly (returns, never throws) as soon as `signal` aborts.
 */
export async function* replayFixture(name: FixtureName, opts: ReplayOptions = {}): AsyncGenerator<StreamMessage> {
  const { signal, speed = 1, round = 0 } = opts;
  const start = Date.now();
  for (const { at_ms, message } of FIXTURE_TURNS[name].messages) {
    if (!(await abortableDelay(Math.max(0, at_ms * speed - (Date.now() - start)), signal))) return;
    yield namespaceFixtureMessage(message, round);
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
