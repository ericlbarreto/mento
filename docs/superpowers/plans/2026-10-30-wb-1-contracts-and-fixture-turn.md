# Whiteboard back-end, Plan 1: contracts, fixtures and the fixture turn endpoint

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the shapes the front-end consumes (actions, turn stream, events, student captions) as Zod schemas in `@mento/contracts`, and let Person 2 integrate immediately through recorded fixtures served by `GET /api/dev/fixture-turn`, with no LLM involved.

**Architecture:** Zod schemas are the single definition; TypeScript types are inferred from them. Recorded turns live as JSON in `fixtures/turns/`, validated by `pnpm fixtures:check` (CI) and replayed over the real SSE helper by the API. The same `StreamMessage` schema is what later plans' real turn handler is tested against.

**Tech Stack:** TypeScript (strict, ESM), Zod 4, Fastify 5 + `fastify-type-provider-zod`, Vitest 5, tsx.

**Spec:** `docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md` (§4 contracts, §9 tests). Canonical older shapes: `workstreams/contracts-spec.md`.

**Series:** Plan 1 (this) → Plan 2 voice → Plan 3 turn handler → Plan 4 drawing and judge → Plan 5 retrieval (Person 1). Plans 2–4 import only what Plan 1 exports.

## Global Constraints

- Field names are `snake_case` everywhere a shape is serialized or stored; ids are strings (MongoDB `_id` as 24-hex string; board/action/turn ids like `el_…`, `act_…`, `turn_…`).
- Enums are closed lists; unknown values must be rejected by Zod.
- Timestamps are ISO 8601 UTC strings; durations and word times are integer milliseconds.
- Repository files are English; the product text inside fixtures is Brazilian Portuguese.
- Node ≥ 22, TypeScript `~6.0.3`, Zod `^4.6.7`, pnpm workspace (`@mento/*` packages export TypeScript source).
- The board model chooses a `column` (`main` | `visuals` | `side`), never coordinates.
- No student names in anything sent to an LLM or TTS (fixtures use no names).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/contracts/src/citation.ts` | `Citation` schema |
| `packages/contracts/src/actions.ts` | Tool-call schemas, the `Action` union, `ActionName` |
| `packages/contracts/src/speech.ts` | `WordTiming`, `SttCaption`, `SpeechPlayer` interface |
| `packages/contracts/src/stream.ts` | `TurnTiming`, `StreamMessage` union |
| `packages/contracts/src/events.ts` | `EventType`, `Event`, `TurnRequest` (client → server) |
| `packages/contracts/src/fixtures.ts` | `FixtureTurn` (dev replay format) |
| `packages/contracts/src/index.ts` | Re-exports |
| `fixtures/turns/rome-intro.json`, `click-and-ask.json` | Recorded turns |
| `scripts/fixture-check.ts` | Validates every fixture (CI) |
| `scripts/turn-cli.ts` | Prints a fixture as a timed transcript |
| `apps/api/src/plugins/sse.ts` | Add `sendStreamMessage` |
| `apps/api/src/routes/dev-fixtures.ts` | `GET /api/dev/fixture-turn` |
| `apps/api/src/routes/dev-fixtures.test.ts` | Contract test over the real SSE |

---

### Task 1: Citation and actions

**Files:**
- Create: `packages/contracts/src/citation.ts`
- Create: `packages/contracts/src/actions.ts`
- Test: `packages/contracts/src/actions.test.ts`
- Modify: `packages/contracts/src/index.ts` (already exports `./actions` and `./citation` as empty modules; no change needed)

**Interfaces:**
- Produces: `Citation`, `Action` (discriminated on `name`), `ActionName`, `Column`, `ElementId`; per-tool arg schemas `SpeakArgs`, `WriteTextArgs`, `WriteTimelineArgs`, `HighlightArgs`, `CircleAnnotateArgs`, `DrawArgs`, `DrawResultArgs`, `UpdateElementArgs`, `RemoveElementArgs`, `AskVerificationArgs`; model-facing bases without server-filled fields `SpeakBase`, `WriteTextBase`, `AskVerificationBase` (used by Plan 3 to build the tool schemas).

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Action, ActionName, AskVerificationArgs, AskVerificationBase, SpeakArgs, SpeakBase, WriteTextBase } from "./actions";

const speak = (args: Record<string, unknown>) => ({ id: "act_1", name: "speak", args });

describe("Action", () => {
  it("accepts a plain speak", () => {
    expect(Action.safeParse(speak({ text: "Olá!" })).success).toBe(true);
  });

  it("requires hint_level when purpose is hint", () => {
    expect(Action.safeParse(speak({ text: "Pense na data.", purpose: "hint" })).success).toBe(false);
    expect(Action.safeParse(speak({ text: "Pense na data.", purpose: "hint", hint_level: 1 })).success).toBe(true);
  });

  it("accepts a citation with a string material_id", () => {
    const sources = [{ material_id: "6650f0c2a1b2c3d4e5f60718", page: 12, quote: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto" }];
    expect(Action.safeParse(speak({ text: "Repare nessa data.", sources })).success).toBe(true);
  });

  it("rejects an unknown tool and an unknown column", () => {
    expect(Action.safeParse({ id: "act_2", name: "teleport", args: {} }).success).toBe(false);
    const bad = { id: "act_3", name: "write_text", args: { id: "title", column: "left", html: "<p>x</p>" } };
    expect(Action.safeParse(bad).success).toBe(false);
  });

  it("rejects element ids that are not snake_case slugs", () => {
    const bad = { id: "act_4", name: "highlight", args: { target_id: "Meu Título", color: "yellow" } };
    expect(Action.safeParse(bad).success).toBe(false);
  });

  it("validates timeline events and draw dimensions", () => {
    const tl = { id: "act_5", name: "write_timeline", args: { id: "tl", column: "main", events: [{ date: "509 a.C.", label: "Início da República" }] } };
    expect(Action.safeParse(tl).success).toBe(true);
    const draw = { id: "act_6", name: "draw", args: { id: "colosseum", column: "visuals", prompt: "Coliseu romano", is_structured: false, max_dimensions: { w: 500, h: 400 } } };
    expect(Action.safeParse(draw).success).toBe(true);
    expect(Action.safeParse({ ...draw, args: { ...draw.args, max_dimensions: { w: 0, h: 400 } } }).success).toBe(false);
  });

  it("exposes model-facing bases without the server-filled fields", () => {
    expect("audio_url" in SpeakBase.shape).toBe(false);
    expect("audio_url" in SpeakArgs.shape).toBe(true);
    expect("verification_id" in AskVerificationBase.shape).toBe(false);
    expect("concept_key" in AskVerificationArgs.shape).toBe(true);
    expect(WriteTextBase.safeParse({ id: "t", column: "main", html: "<p>x</p>" }).success).toBe(true);
  });

  it("lists every tool name", () => {
    expect(ActionName.options).toEqual([
      "speak", "write_text", "write_timeline", "highlight", "circle_annotate",
      "draw", "draw_result", "update_element", "remove_element", "ask_verification",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/contracts test`
Expected: FAIL ("Cannot find module './actions'" resolves to an empty module without `Action`; assertions error).

- [ ] **Step 3: Write the minimal implementation**

Create `packages/contracts/src/citation.ts`:

```ts
import { z } from "zod";

/** A source the tutor cites. `quote` must occur in that page (validated server-side). */
export const Citation = z.object({
  material_id: z.string().min(1),
  page: z.number().int().min(1),
  quote: z.string().min(1).max(400),
});
export type Citation = z.infer<typeof Citation>;
```

Create `packages/contracts/src/actions.ts` (replaces the placeholder):

```ts
import { z } from "zod";
import { Citation } from "./citation";

export const Column = z.enum(["main", "visuals", "side"]);
export type Column = z.infer<typeof Column>;

/** Stable element id chosen by the model: short snake_case slug, unique per session. */
export const ElementId = z.string().regex(/^[a-z][a-z0-9_]{0,40}$/, "element id must be a short snake_case slug");

const Purpose = z.enum(["explain", "hint", "praise", "question", "transition"]);
const HintLevel = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const needsHintLevel = <T extends { purpose?: string; hint_level?: number }>(a: T) =>
  a.purpose !== "hint" || a.hint_level !== undefined;
const hintMessage = { message: "hint_level is required when purpose is hint", path: ["hint_level"] };

const Grounding = {
  sources: z.array(Citation).max(4).optional(),
  outside_material: z.boolean().optional(),
};

/** What the model may send (no server-filled fields, no refinement: safe to turn into a JSON schema). */
export const SpeakBase = z.object({
  text: z.string().min(1).max(600),
  style: z.string().max(40).optional(),
  purpose: Purpose.optional(),
  hint_level: HintLevel.optional(),
  ...Grounding,
});
/** What the client receives: adds the audio fields the server fills in voice mode (Plan 2). */
export const SpeakArgs = SpeakBase.extend({
  audio_url: z.string().optional(),
  audio_format: z.literal("pcm_s16le_24000").optional(),
}).refine(needsHintLevel, hintMessage);

export const WriteTextBase = z.object({
  id: ElementId,
  column: Column,
  html: z.string().min(1).max(4000),
  purpose: Purpose.optional(),
  hint_level: HintLevel.optional(),
  ...Grounding,
});
export const WriteTextArgs = WriteTextBase.refine(needsHintLevel, hintMessage);

export const WriteTimelineArgs = z.object({
  id: ElementId,
  column: Column,
  events: z.array(z.object({ date: z.string().min(1).max(40), label: z.string().min(1).max(120) })).min(1).max(12),
});

export const HighlightArgs = z.object({
  target_id: ElementId,
  color: z.enum(["yellow", "green", "pink", "blue"]),
});

export const CircleAnnotateArgs = z.object({
  target_id: ElementId,
  text_to_match: z.string().min(1).max(120),
  color: z.enum(["red", "blue", "green"]),
});

export const DrawArgs = z.object({
  id: ElementId,
  column: Column,
  prompt: z.string().min(1).max(500),
  is_structured: z.boolean(),
  max_dimensions: z.object({ w: z.number().int().min(50).max(1200), h: z.number().int().min(50).max(1200) }),
});

/** Server → client only: the finished image replaces the placeholder of element `element_id`. */
export const DrawResultArgs = z.object({ element_id: ElementId, url: z.string().min(1) });

export const UpdateElementArgs = z.object({ id: ElementId, html: z.string().min(1).max(4000) });
export const RemoveElementArgs = z.object({ id: ElementId });

/** What the model may send; the server adds `verification_id` and `concept_key`. */
export const AskVerificationBase = z.object({
  id: ElementId,
  column: Column,
  concept: z.string().min(1).max(60),
  question: z.string().min(1).max(300),
  kind: z.enum(["explain", "transfer", "place_on_timeline"]),
});
export const AskVerificationArgs = AskVerificationBase.extend({
  verification_id: z.string().min(1),
  concept_key: z.string().min(1).max(60),
});

export const ActionName = z.enum([
  "speak", "write_text", "write_timeline", "highlight", "circle_annotate",
  "draw", "draw_result", "update_element", "remove_element", "ask_verification",
]);
export type ActionName = z.infer<typeof ActionName>;

const action = <N extends string, A extends z.ZodType>(name: N, args: A) =>
  z.object({ id: z.string().min(1), name: z.literal(name), args });

export const Action = z.discriminatedUnion("name", [
  action("speak", SpeakArgs),
  action("write_text", WriteTextArgs),
  action("write_timeline", WriteTimelineArgs),
  action("highlight", HighlightArgs),
  action("circle_annotate", CircleAnnotateArgs),
  action("draw", DrawArgs),
  action("draw_result", DrawResultArgs),
  action("update_element", UpdateElementArgs),
  action("remove_element", RemoveElementArgs),
  action("ask_verification", AskVerificationArgs),
]);
export type Action = z.infer<typeof Action>;
```

- [ ] **Step 4: Run the test and the type check**

Run: `pnpm --filter @mento/contracts test && pnpm --filter @mento/contracts typecheck`
Expected: PASS (6 tests in `actions.test.ts` plus the 2 existing), no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/citation.ts packages/contracts/src/actions.ts packages/contracts/src/actions.test.ts
git commit -m "feat(contracts): citation and tutor action schemas"
```

---

### Task 2: Speech captions and the turn stream union

**Files:**
- Create: `packages/contracts/src/speech.ts` (replaces placeholder)
- Create: `packages/contracts/src/stream.ts` (replaces placeholder)
- Test: `packages/contracts/src/stream.test.ts`

**Interfaces:**
- Consumes: `Action`, `ElementId` from `./actions`.
- Produces: `WordTiming`, `SttCaption`, `SpeechPlayer` (type), `TurnTiming`, `StreamMessage`, `StreamMessageType`.

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/stream.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { StreamMessage } from "./stream";
import { SttCaption } from "./speech";

describe("StreamMessage", () => {
  it("accepts every message kind", () => {
    const messages = [
      { type: "action", order: 0, action: { id: "act_1", name: "speak", args: { text: "Olá!" } } },
      { type: "svg_chunk", element_id: "diagram", chunk: "<svg" },
      { type: "speech_alignment", action_id: "act_1", words: [{ word: "Olá!", start_ms: 0, end_ms: 320 }] },
      { type: "script_done", turn_id: "turn_1" },
      { type: "turn_done", turn_id: "turn_1", timing: { first_action_ms: 1380, script_done_ms: 4100 } },
      { type: "error", code: "llm_timeout", message: "O tutor demorou demais.", recoverable: true },
    ];
    for (const m of messages) expect(StreamMessage.safeParse(m).success, JSON.stringify(m)).toBe(true);
  });

  it("rejects an unknown type and a word with end before start", () => {
    expect(StreamMessage.safeParse({ type: "done" }).success).toBe(false);
    const bad = { type: "speech_alignment", action_id: "act_1", words: [{ word: "x", start_ms: 500, end_ms: 100 }] };
    expect(StreamMessage.safeParse(bad).success).toBe(false);
  });
});

describe("SttCaption", () => {
  it("accepts interim and final captions with word timings", () => {
    const caption = {
      kind: "final",
      text: "Quem foi Augusto?",
      words: [
        { word: "Quem", start_ms: 0, end_ms: 200, confidence: 0.98 },
        { word: "foi", start_ms: 210, end_ms: 350, confidence: 0.97 },
        { word: "Augusto?", start_ms: 360, end_ms: 800, confidence: 0.93 },
      ],
      speech_final: true,
    };
    expect(SttCaption.safeParse(caption).success).toBe(true);
    expect(SttCaption.safeParse({ ...caption, kind: "partial" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/contracts test`
Expected: FAIL (`StreamMessage` / `SttCaption` are not exported).

- [ ] **Step 3: Write the minimal implementation**

Create `packages/contracts/src/speech.ts`:

```ts
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
```

Create `packages/contracts/src/stream.ts`:

```ts
import { z } from "zod";
import { Action, ElementId } from "./actions";
import { WordTiming } from "./speech";

/** Stage timings of one turn, in ms since the request was received. All optional: stages may not run. */
export const TurnTiming = z.object({
  context_ready_ms: z.number().int().min(0).optional(),
  llm_first_token_ms: z.number().int().min(0).optional(),
  first_action_ms: z.number().int().min(0).optional(),
  tts_first_byte_ms: z.number().int().min(0).optional(),
  first_audio_chunk_ms: z.number().int().min(0).optional(),
  script_done_ms: z.number().int().min(0).optional(),
  image_ready_ms: z.number().int().min(0).optional(),
});
export type TurnTiming = z.infer<typeof TurnTiming>;

/** Every message the turn SSE stream can carry. On the wire: `event: <type>` and `data: <this JSON>`. */
export const StreamMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("action"), order: z.number().int().min(0), action: Action }),
  z.object({ type: z.literal("svg_chunk"), element_id: ElementId, chunk: z.string() }),
  z.object({ type: z.literal("speech_alignment"), action_id: z.string().min(1), words: z.array(WordTiming) }),
  z.object({ type: z.literal("script_done"), turn_id: z.string().min(1) }),
  z.object({ type: z.literal("turn_done"), turn_id: z.string().min(1), timing: TurnTiming.optional() }),
  z.object({ type: z.literal("error"), code: z.string().min(1), message: z.string(), recoverable: z.boolean() }),
]);
export type StreamMessage = z.infer<typeof StreamMessage>;
export type StreamMessageType = StreamMessage["type"];
```

- [ ] **Step 4: Run the test and the type check**

Run: `pnpm --filter @mento/contracts test && pnpm --filter @mento/contracts typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/speech.ts packages/contracts/src/stream.ts packages/contracts/src/stream.test.ts
git commit -m "feat(contracts): turn stream union and speech caption schemas"
```

---

### Task 3: Events, turn request and the fixture format

**Files:**
- Create: `packages/contracts/src/events.ts` (replaces placeholder)
- Create: `packages/contracts/src/fixtures.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/events.test.ts`

**Interfaces:**
- Consumes: `StreamMessage` from `./stream`.
- Produces: `EventType`, `Event`, `UserMessageInput`, `VerificationAnswerInput`, `Interrupted`, `TurnRequest`, `FixtureTurn`.

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Event, EventType, TurnRequest } from "./events";
import { FixtureTurn } from "./fixtures";

describe("EventType", () => {
  it("is the closed list of contracts-spec section 3", () => {
    expect(EventType.options).toEqual([
      "session_started", "user_message", "tutor_action", "verification_asked", "verification_answered",
      "hint_given", "evidence_recorded", "interrupted", "mic_state", "turn_timing", "session_ended",
    ]);
  });
});

describe("Event", () => {
  it("has a string id and ISO timestamp", () => {
    const e = { id: "6650f0c2a1b2c3d4e5f60718", session_id: "6650f0c2a1b2c3d4e5f60719", ts: "2026-10-30T21:00:00.000Z", type: "user_message", payload: { text: "oi" } };
    expect(Event.safeParse(e).success).toBe(true);
    expect(Event.safeParse({ ...e, ts: "ontem" }).success).toBe(false);
    expect(Event.safeParse({ ...e, id: 7 }).success).toBe(false);
  });
});

describe("TurnRequest", () => {
  it("allows an opening turn with no message", () => {
    expect(TurnRequest.safeParse({ modality: "voice", appended: [] }).success).toBe(true);
  });

  it("accepts a board_select message with the selected element", () => {
    const req = {
      modality: "voice",
      appended: [{ name: "user_message", kind: "board_select", text: "O que é isso?", selected: { element_id: "tl_republica", text: "27 a.C." }, stt: { provider: "deepgram", duration_ms: 1800, confidence: 0.94 } }],
      interrupted: { turn_id: "turn_1", action_id: "act_3", spoken_chars: 40, spoken_ms: 2100 },
      client_timing: { speech_end_to_audio_ms: 2300 },
    };
    expect(TurnRequest.safeParse(req).success).toBe(true);
  });

  it("accepts an answer to a verification", () => {
    const req = { modality: "text", appended: [{ name: "verification_answer", verification_id: "ver_1", element_id: "q_augusto", answer: "Foi em 27 a.C." }] };
    expect(TurnRequest.safeParse(req).success).toBe(true);
  });

  it("rejects an unknown message kind", () => {
    const req = { modality: "text", appended: [{ name: "user_message", kind: "shout", text: "x" }] };
    expect(TurnRequest.safeParse(req).success).toBe(false);
  });
});

describe("FixtureTurn", () => {
  it("wraps messages with a delay and rejects an invalid message", () => {
    const ok = { description: "x", messages: [{ at_ms: 0, message: { type: "script_done", turn_id: "turn_1" } }] };
    expect(FixtureTurn.safeParse(ok).success).toBe(true);
    const bad = { description: "x", messages: [{ at_ms: 0, message: { type: "nope" } }] };
    expect(FixtureTurn.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/contracts test`
Expected: FAIL (`EventType`, `TurnRequest`, `FixtureTurn` not exported).

- [ ] **Step 3: Write the minimal implementation**

Create `packages/contracts/src/events.ts`:

```ts
import { z } from "zod";
import { ElementId } from "./actions";

/** The only event list (contracts-spec section 3). Payload shapes per type live with their writers. */
export const EventType = z.enum([
  "session_started", "user_message", "tutor_action", "verification_asked", "verification_answered",
  "hint_given", "evidence_recorded", "interrupted", "mic_state", "turn_timing", "session_ended",
]);
export type EventType = z.infer<typeof EventType>;

export const Event = z.object({
  id: z.string().min(1),
  session_id: z.string().min(1),
  ts: z.iso.datetime(),
  type: EventType,
  payload: z.unknown(),
});
export type Event = z.infer<typeof Event>;

export const SttSummary = z.object({
  provider: z.string().min(1),
  duration_ms: z.number().int().min(0),
  confidence: z.number().min(0).max(1).optional(),
});

export const UserMessageInput = z.object({
  name: z.literal("user_message"),
  kind: z.enum(["chat", "speech", "board_select", "quick_action"]),
  text: z.string().min(1).max(2000),
  selected: z.object({ element_id: ElementId, text: z.string().max(400).optional() }).optional(),
  stt: SttSummary.optional(),
});

export const VerificationAnswerInput = z.object({
  name: z.literal("verification_answer"),
  verification_id: z.string().min(1),
  element_id: ElementId,
  answer: z.string().min(1).max(2000),
});

export const Interrupted = z.object({
  turn_id: z.string().min(1),
  action_id: z.string().min(1).optional(),
  spoken_chars: z.number().int().min(0).optional(),
  spoken_ms: z.number().int().min(0).optional(),
});

/** Body of POST /api/sessions/:id/turn. `appended` is empty for the tutor's opening turn. */
export const TurnRequest = z.object({
  modality: z.enum(["text", "voice"]),
  appended: z.array(z.discriminatedUnion("name", [UserMessageInput, VerificationAnswerInput])).max(5),
  interrupted: Interrupted.optional(),
  client_timing: z.object({ speech_end_to_audio_ms: z.number().int().min(0).optional() }).optional(),
});
export type TurnRequest = z.infer<typeof TurnRequest>;
```

Create `packages/contracts/src/fixtures.ts`:

```ts
import { z } from "zod";
import { StreamMessage } from "./stream";

/** A recorded turn: each message is delivered `at_ms` after the start of the replay. */
export const FixtureTurn = z.object({
  description: z.string().min(1),
  messages: z.array(z.object({ at_ms: z.number().int().min(0), message: StreamMessage })).min(1),
});
export type FixtureTurn = z.infer<typeof FixtureTurn>;
```

Modify `packages/contracts/src/index.ts` to add the fixtures export (the rest already exports `./events`, `./stream`, etc.):

```ts
export * from "./ping";
export * from "./health";
export * from "./concept";
export * from "./actions";
export * from "./stream";
export * from "./events";
export * from "./citation";
export * from "./evidence";
export * from "./insights";
export * from "./repository";
export * from "./speech";
export * from "./infra";
export * from "./fixtures";
```

- [ ] **Step 4: Run the test and the type check**

Run: `pnpm --filter @mento/contracts test && pnpm --filter @mento/contracts typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src
git commit -m "feat(contracts): event envelope, turn request and fixture format"
```

---

### Task 4: Recorded fixtures and `fixtures:check`

**Files:**
- Create: `fixtures/turns/rome-intro.json`
- Create: `fixtures/turns/click-and-ask.json`
- Modify: `scripts/fixture-check.ts` (replace the stub)
- Modify: `.github/workflows/ci.yml` (add the check step)

**Interfaces:**
- Consumes: `FixtureTurn` from `@mento/contracts`.
- Produces: two valid fixtures named `rome-intro` and `click-and-ask` (used by Task 5 and Task 6 and by Person 2).

- [ ] **Step 1: Write the failing check**

Replace `scripts/fixture-check.ts` with:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FixtureTurn } from "@mento/contracts";

const dir = join(import.meta.dirname, "..", "fixtures", "turns");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error(`fixtures:check: no fixtures found in ${dir}`);
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const result = FixtureTurn.safeParse(JSON.parse(readFileSync(join(dir, file), "utf8")));
  if (result.success) {
    console.log(`ok   ${file} (${result.data.messages.length} messages)`);
  } else {
    failed = true;
    console.error(`FAIL ${file}`);
    for (const issue of result.error.issues) console.error(`     ${issue.path.join(".")}: ${issue.message}`);
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm fixtures:check`
Expected: FAIL with "no fixtures found" (only `.gitkeep` exists), exit code 1.

- [ ] **Step 3: Create the fixtures**

Create `fixtures/turns/rome-intro.json` (the tutor's opening lesson: title, speech, an illustration, a timeline, a cited remark, a circle):

```json
{
  "description": "Opening lesson on the end of the Roman Republic: title, speech with word timings, illustration placeholder, timeline, cited remark, circle on a date, late image result.",
  "messages": [
    { "at_ms": 0, "message": { "type": "action", "order": 0, "action": { "id": "act_1", "name": "write_text", "args": { "id": "title", "column": "main", "html": "<h1>Da República ao Império</h1>" } } } },
    { "at_ms": 60, "message": { "type": "action", "order": 1, "action": { "id": "act_2", "name": "speak", "args": { "text": "Hoje vamos ver como Roma deixou de ser uma República.", "style": "warm", "audio_url": "/api/tts/act_2", "audio_format": "pcm_s16le_24000" } } } },
    { "at_ms": 120, "message": { "type": "speech_alignment", "action_id": "act_2", "words": [
      { "word": "Hoje", "start_ms": 0, "end_ms": 260 },
      { "word": "vamos", "start_ms": 260, "end_ms": 560 },
      { "word": "ver", "start_ms": 560, "end_ms": 760 },
      { "word": "como", "start_ms": 760, "end_ms": 1010 },
      { "word": "Roma", "start_ms": 1010, "end_ms": 1330 },
      { "word": "deixou", "start_ms": 1330, "end_ms": 1700 },
      { "word": "de", "start_ms": 1700, "end_ms": 1810 },
      { "word": "ser", "start_ms": 1810, "end_ms": 2010 },
      { "word": "uma", "start_ms": 2010, "end_ms": 2180 },
      { "word": "República.", "start_ms": 2180, "end_ms": 2900 }
    ] } },
    { "at_ms": 200, "message": { "type": "action", "order": 2, "action": { "id": "act_3", "name": "draw", "args": { "id": "colosseum", "column": "visuals", "prompt": "Esboço do Coliseu romano em lápis de cor", "is_structured": false, "max_dimensions": { "w": 500, "h": 400 } } } } },
    { "at_ms": 260, "message": { "type": "action", "order": 3, "action": { "id": "act_4", "name": "write_timeline", "args": { "id": "tl_republica", "column": "main", "events": [
      { "date": "509 a.C.", "label": "Início da República" },
      { "date": "27 a.C.", "label": "Otávio recebe o título de Augusto" }
    ] } } } },
    { "at_ms": 320, "message": { "type": "action", "order": 4, "action": { "id": "act_5", "name": "speak", "args": { "text": "Repare nesta data: 27 a.C. Foi quando o Senado deu a Otávio o título de Augusto.", "audio_url": "/api/tts/act_5", "audio_format": "pcm_s16le_24000", "sources": [ { "material_id": "6650f0c2a1b2c3d4e5f60718", "page": 12, "quote": "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto" } ] } } } },
    { "at_ms": 380, "message": { "type": "action", "order": 5, "action": { "id": "act_6", "name": "circle_annotate", "args": { "target_id": "tl_republica", "text_to_match": "27 a.C.", "color": "red" } } } },
    { "at_ms": 420, "message": { "type": "script_done", "turn_id": "turn_1" } },
    { "at_ms": 900, "message": { "type": "action", "order": 6, "action": { "id": "act_7", "name": "draw_result", "args": { "element_id": "colosseum", "url": "/files/gen/colosseum.jpg" } } } },
    { "at_ms": 940, "message": { "type": "turn_done", "turn_id": "turn_1", "timing": { "first_action_ms": 1380, "script_done_ms": 4100, "image_ready_ms": 8700 } } }
  ]
}
```

Create `fixtures/turns/click-and-ask.json` (the student selected "27 a.C." and asked; the tutor answers about that element and annotates it, asking a verification):

```json
{
  "description": "Click-and-ask: the student selected '27 a.C.' on the timeline; the tutor answers, highlights the element and asks a verification question.",
  "messages": [
    { "at_ms": 0, "message": { "type": "action", "order": 0, "action": { "id": "act_11", "name": "speak", "args": { "text": "Boa pergunta! Essa é a data em que Otávio vira Augusto.", "audio_url": "/api/tts/act_11", "audio_format": "pcm_s16le_24000" } } } },
    { "at_ms": 60, "message": { "type": "action", "order": 1, "action": { "id": "act_12", "name": "highlight", "args": { "target_id": "tl_republica", "color": "yellow" } } } },
    { "at_ms": 120, "message": { "type": "action", "order": 2, "action": { "id": "act_13", "name": "write_text", "args": { "id": "nota_augusto", "column": "side", "html": "<p><b>Augusto</b>: primeiro imperador de Roma.</p>", "purpose": "explain", "sources": [ { "material_id": "6650f0c2a1b2c3d4e5f60718", "page": 12, "quote": "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto" } ] } } } },
    { "at_ms": 180, "message": { "type": "action", "order": 3, "action": { "id": "act_14", "name": "speak", "args": { "text": "Agora me diga com suas palavras: o que mudou na forma de governar Roma depois disso?", "purpose": "question", "audio_url": "/api/tts/act_14", "audio_format": "pcm_s16le_24000" } } } },
    { "at_ms": 240, "message": { "type": "action", "order": 4, "action": { "id": "act_15", "name": "ask_verification", "args": { "id": "q_augusto", "column": "main", "verification_id": "ver_1", "concept": "Fim da República", "concept_key": "fim da republica", "question": "O que mudou na forma de governar Roma depois de 27 a.C.?", "kind": "explain" } } } },
    { "at_ms": 280, "message": { "type": "script_done", "turn_id": "turn_2" } },
    { "at_ms": 300, "message": { "type": "turn_done", "turn_id": "turn_2", "timing": { "first_action_ms": 1210, "script_done_ms": 3300 } } }
  ]
}
```

- [ ] **Step 4: Run the check to verify it passes**

Run: `pnpm fixtures:check`
Expected: PASS with two `ok` lines (`rome-intro.json (10 messages)`, `click-and-ask.json (7 messages)`), exit code 0. If a `FAIL` line appears, fix the JSON path it prints.

- [ ] **Step 5: Add the check to CI and commit**

In `.github/workflows/ci.yml`, after the `pnpm test` step, add:

```yaml
      - run: pnpm fixtures:check
```

```bash
git add fixtures/turns scripts/fixture-check.ts .github/workflows/ci.yml
git commit -m "feat(fixtures): recorded Rome turns and fixtures:check"
```

---

### Task 5: SSE helper for stream messages and the fixture turn endpoint

**Files:**
- Modify: `apps/api/src/plugins/sse.ts` (add `sendStreamMessage`)
- Modify: `apps/api/src/routes/dev-fixtures.ts` (replace the stub)
- Test: `apps/api/src/routes/dev-fixtures.test.ts`

**Interfaces:**
- Consumes: `StreamMessage`, `FixtureTurn` from `@mento/contracts`; `openSse`, `Sse` from `plugins/sse.ts`.
- Produces: `sendStreamMessage(sse: Sse, message: StreamMessage): void` (validates before sending; used by Plan 3's turn handler); route `GET /api/dev/fixture-turn?name=<fixture>&speed=<number>` (`speed` multiplies the replay clock; `0` = instant; default `1`).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/dev-fixtures.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { StreamMessage } from "@mento/contracts";
import { buildApp } from "../app";
import { loadConfig } from "../config";

let app: FastifyInstance;
let base: string;

beforeEach(async () => {
  app = await buildApp(loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv));
  await app.listen({ port: 0, host: "127.0.0.1" });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
});
afterEach(async () => {
  await app.close();
});

/** Parse an SSE body into [event, data] pairs. */
function parseSse(text: string) {
  return text
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith(":"))
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? "";
      return { event, data: JSON.parse(data) as unknown };
    });
}

describe("GET /api/dev/fixture-turn", () => {
  it("streams a fixture where every message satisfies the StreamMessage contract", async () => {
    const res = await fetch(`${base}/api/dev/fixture-turn?name=rome-intro&speed=0`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = parseSse(await res.text());
    expect(events.length).toBeGreaterThan(5);
    for (const { event, data } of events) {
      const parsed = StreamMessage.parse(data);
      expect(event).toBe(parsed.type);
    }
    expect(events.at(-1)?.event).toBe("turn_done");
    const types = events.map((e) => e.event);
    expect(types.indexOf("script_done")).toBeLessThan(types.indexOf("turn_done"));
  });

  it("answers 404 for an unknown fixture and 400 for an unsafe name", async () => {
    expect((await fetch(`${base}/api/dev/fixture-turn?name=nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/dev/fixture-turn?name=../../package`)).status).toBe(400);
  });

  it("stops replaying when the client disconnects", async () => {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/dev/fixture-turn?name=rome-intro&speed=1`, { signal: controller.signal });
    const reader = res.body!.getReader();
    await reader.read(); // first chunk arrives, then we leave
    controller.abort();
    await new Promise((r) => setTimeout(r, 100));
    await app.close(); // must not hang on a still-running replay
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/api test`
Expected: FAIL (the route stub returns 404 for everything and sends no stream).

- [ ] **Step 3: Write the minimal implementation**

Modify `apps/api/src/plugins/sse.ts`: add this import at the top and the function at the bottom of the file:

```ts
import { StreamMessage } from "@mento/contracts";
```

```ts
/**
 * Send one validated turn-stream message: `event: <type>` and `data: <message JSON>`.
 * Throws if the message breaks the contract, so a bad message never reaches the front-end.
 */
export function sendStreamMessage(sse: Sse, message: StreamMessage): void {
  const valid = StreamMessage.parse(message);
  sse.send(valid.type, valid);
}
```

Replace `apps/api/src/routes/dev-fixtures.ts` with:

```ts
import { readFile } from "node:fs/promises";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { FixtureTurn } from "@mento/contracts";
import { openSse, sendStreamMessage } from "../plugins/sse";

const FIXTURES_DIR = new URL("../../../../fixtures/turns/", import.meta.url);

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

// GET /api/dev/fixture-turn?name=rome-intro&speed=1: replays a recorded turn in the real SSE format,
// so the front-end can be built before the LLM exists. `speed` scales the clock (0 = instant).
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/dev/fixture-turn",
    {
      schema: {
        querystring: z.object({
          name: z.string().regex(/^[a-z0-9-]+$/),
          speed: z.coerce.number().min(0).max(10).default(1),
        }),
      },
    },
    async (request, reply) => {
      const { name, speed } = request.query;
      let fixture: FixtureTurn;
      try {
        fixture = FixtureTurn.parse(JSON.parse(await readFile(new URL(`${name}.json`, FIXTURES_DIR), "utf8")));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return reply.status(404).send({ error: "fixture_not_found", name });
        throw err;
      }

      const sse = openSse(request, reply);
      let previous = 0;
      for (const { at_ms, message } of fixture.messages) {
        await sleep((at_ms - previous) * speed, sse.signal);
        if (sse.signal.aborted) break;
        previous = at_ms;
        sendStreamMessage(sse, message);
      }
      sse.close();
    },
  );
};

export default plugin;
```

`FixtureTurn` is both a value and a type exported from `@mento/contracts`, so the single import above covers both uses.

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/api test && pnpm --filter @mento/api typecheck`
Expected: PASS (the three new tests plus the existing three), no type errors. The 400 case relies on the Zod querystring regex; the type provider turns the failure into the 400 from the app's error handler.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): validated SSE stream messages and the fixture turn endpoint"
```

---

### Task 6: `turn-cli`, documents and the front-end hand-off

**Files:**
- Modify: `scripts/turn-cli.ts` (replace the stub)
- Modify: `docs/16-technical-roadmap.md` (§3.2)
- Modify: `workstreams/contracts-spec.md` (new §12)
- Modify: `docs/10-decisions.md` (decisions D47–D51)
- Create: `docs/frontend-contract.md`

**Interfaces:**
- Consumes: `FixtureTurn`, `StreamMessage` from `@mento/contracts`.
- Produces: `pnpm turn <fixture-name>` prints a timed transcript; `docs/frontend-contract.md` is the page Person 2 reads.

- [ ] **Step 1: Write the CLI**

Replace `scripts/turn-cli.ts` with:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FixtureTurn, type StreamMessage } from "@mento/contracts";

const name = process.argv[2];
if (!name) {
  console.error("usage: pnpm turn <fixture-name>   (fixtures/turns/<name>.json)");
  process.exit(1);
}

const file = join(import.meta.dirname, "..", "fixtures", "turns", `${name}.json`);
const fixture = FixtureTurn.parse(JSON.parse(readFileSync(file, "utf8")));

function describe(m: StreamMessage): string {
  switch (m.type) {
    case "action": {
      const a = m.action;
      const detail = a.name === "speak" ? `"${a.args.text}"` : JSON.stringify(a.args).slice(0, 80);
      return `#${m.order} ${a.name} ${detail}`;
    }
    case "speech_alignment": return `alignment ${m.action_id}: ${m.words.map((w) => w.word).join(" ")}`;
    case "svg_chunk": return `svg_chunk ${m.element_id} (${m.chunk.length} chars)`;
    case "script_done": return `script_done ${m.turn_id}`;
    case "turn_done": return `turn_done ${m.turn_id} ${JSON.stringify(m.timing ?? {})}`;
    case "error": return `error ${m.code}: ${m.message} (recoverable: ${m.recoverable})`;
  }
}

console.log(fixture.description, "\n");
for (const { at_ms, message } of fixture.messages) {
  console.log(`+${String(at_ms).padStart(5)} ms  ${describe(message)}`);
}
```

- [ ] **Step 2: Run it to verify the output**

Run: `pnpm turn rome-intro`
Expected: the description, then 10 lines starting `+    0 ms  #0 write_text {...}` and ending with `turn_done turn_1 {"first_action_ms":1380,...}`. `pnpm turn missing` exits non-zero with a file-not-found error.

- [ ] **Step 3: Update `docs/16-technical-roadmap.md` §3.2**

Replace the SSE JSON example block and the bullet list under "3.2 Response (SSE)" with:

````markdown
Each SSE message is `event: <type>` + `data: <JSON>`, and the JSON always has a `type` (the union is `StreamMessage` in `@mento/contracts`; full list in `docs/frontend-contract.md`):

```json
{ "type": "action", "order": 0, "action": { "id": "act_1", "name": "write_text", "args": { "id": "title", "column": "main", "html": "<h1>…</h1>" } } }
{ "type": "action", "order": 1, "action": { "id": "act_2", "name": "speak", "args": { "text": "…", "audio_url": "/api/tts/act_2", "audio_format": "pcm_s16le_24000" } } }
{ "type": "speech_alignment", "action_id": "act_2", "words": [ { "word": "Hoje", "start_ms": 0, "end_ms": 260 } ] }
{ "type": "svg_chunk", "element_id": "diagram", "chunk": "<svg …" }
{ "type": "script_done", "turn_id": "turn_1" }
{ "type": "action", "order": 6, "action": { "id": "act_7", "name": "draw_result", "args": { "element_id": "colosseum", "url": "/files/gen/colosseum.jpg" } } }
{ "type": "turn_done", "turn_id": "turn_1", "timing": { "first_action_ms": 1380 } }
```

- `order` defines playback order; `speak` is the clock.
- `script_done` means every action of the script was emitted: the client opens the microphone after the last `speak`, without waiting for images. `turn_done` comes when pending images finished or timed out.
- Late results (`draw_result`) arrive after `script_done` and update an existing element.
````

- [ ] **Step 4: Update `workstreams/contracts-spec.md`**

Append at the end of the file:

```markdown
## 12. Additions of 2026-10-30 (voice-first back-end design)

Source of truth in code: `packages/contracts` (`actions.ts`, `stream.ts`, `events.ts`, `speech.ts`). Design: `docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md`.

- **Turn stream** is a union tagged by `type`: `action`, `svg_chunk`, `speech_alignment`, `script_done`, `turn_done`, `error` (replaces the old `{order, action}` / `{done}` shape).
- **`speak` args** gain `audio_url` and `audio_format` (voice mode only).
- **`draw_result`** is an action (server → client) that carries `element_id` and `url`.
- **Student captions**: `SttCaption` is produced in the browser by `useStt()`; only `user_message.text` and `stt { provider, duration_ms, confidence? }` are sent and stored.
- **`TurnRequest`**: `appended` is a list of `user_message` or `verification_answer`; `interrupted` gains `spoken_ms`; optional `client_timing`.
- **Sessions** are created with `student_id` only (no `material_id`): the tutor searches all materials. `session_started` loses `material_id`; citations keep `material_id`.
- **Ids** are strings everywhere (MongoDB `_id`).
```

- [ ] **Step 5: Add the decisions to `docs/10-decisions.md`**

Insert these rows after the row `D46`:

```markdown
| D47 | **Voice-first back-end with SSE turn + prefetched audio over HTTP** (not one WebSocket per session, not browser→ElevenLabs direct). Spec: `docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md` | Keeps the planned contracts, simple interruption, server cache and timing |
| D48 | **Turn stream is a union tagged by `type`** with `speech_alignment`, `script_done`, `turn_done`, `error`; student captions come from `useStt()` in the browser | Front-end needs word captions and a clear point to open the mic |
| D49 | **Models:** tutor `claude-sonnet-5-5`, judge `claude-haiku-5-5`, images Google Gemini (founder's choice), embeddings Voyage `voyage-4` by default (free allowance), STT Deepgram, TTS ElevenLabs Flash v2.5 | Latency first; cost is acceptable except embeddings |
| D50 | **Sessions have no `material_id`:** the tutor searches all teacher materials (hybrid vector + text search on MongoDB Atlas) through `searchChunks` | Founder decision: the AI, not the student, picks the material |
| D51 | **Judge runs in parallel with the next tutor turn** and only records evidence | Keeps the judge off the critical path; disagreement is measured |
```

- [ ] **Step 6: Write `docs/frontend-contract.md`**

Create the file with exactly this content:

````markdown
# Front-end contract (Person 2 reads this)

> Source of truth in code: `@mento/contracts` (Zod). This page explains how to use it. Replay any turn without an LLM: `GET http://localhost:4000/api/dev/fixture-turn?name=rome-intro&speed=1` (`speed=0` is instant). Fixtures: `fixtures/turns/`.

## 1. Turn request: `POST /api/sessions/:id/turn`

Body = `TurnRequest`: `{ modality, appended: [...], interrupted?, client_timing? }`. `appended` is empty for the tutor's opening turn. Messages: `user_message` (`kind`: `chat` | `speech` | `board_select` | `quick_action`, `text`, optional `selected { element_id, text }`, optional `stt`) and `verification_answer`.

## 2. Turn response: SSE

`event: <type>` and `data: <JSON>`; parse every `data` with `StreamMessage`.

| `type` | What the client does |
|---|---|
| `action` | Put it in the queue ordered by `order`. `speak` is the clock |
| `speech_alignment` | Words with `start_ms`/`end_ms` for the `speak` with that `action_id`: highlight captions word by word |
| `svg_chunk` | Append to the SVG of `element_id` |
| `script_done` | Last action of the script emitted: open the mic after the last `speak` |
| `turn_done` | Everything finished (including late images) |
| `error` | Show a short message; if `recoverable`, the user can retry |

## 3. Actions (`action.name`)

`speak`, `write_text`, `write_timeline`, `highlight`, `circle_annotate`, `draw`, `draw_result`, `update_element`, `remove_element`, `ask_verification`. Elements have a stable `id` (snake_case) and a `column` (`main` | `visuals` | `side`); the client never receives coordinates. `draw` creates a placeholder; the later `draw_result` replaces it. Use `mix-blend-mode: multiply` on generated images so their white background disappears on the beige board.

## 4. Audio

In voice mode a `speak` has `audio_url` (`/api/tts/:action_id`, chunked PCM 16-bit, 24 kHz). Fetch it as soon as the action arrives (prefetch), play when the queue reaches it. Not available until Plan 2 ships; use text captions meanwhile.

## 5. Interruption

When the student starts speaking: stop the player, abort the turn `fetch` (`AbortController`), clear the queue, then send the next turn with `interrupted { turn_id, action_id?, spoken_chars?, spoken_ms? }`.

## 6. Student captions

`useStt()` (from `@mento/voice/client`, Plan 2) emits `SttCaption`: `{ kind: "interim" | "final", text, words[{ word, start_ms, end_ms, confidence }], speech_final }`. Show interim text live; send the final text as `user_message` with `kind: "speech"`.

## 7. Click-and-ask

Render each element with its `id` as a DOM attribute. On selection send `user_message` with `kind: "board_select"` and `selected { element_id, text }`.
````

- [ ] **Step 7: Run the whole suite and commit**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm fixtures:check`
Expected: all green.

```bash
git add scripts/turn-cli.ts docs workstreams
git commit -m "docs: front-end contract page, decisions D47-D51, spec additions; add turn-cli"
```

---

## Self-review

- **Spec coverage:** §4 stream union, `speak` args, audio endpoint field, `SttCaption`, interruption fields, ids and board snapshot validation inputs → Tasks 1–3; §9 items 1, 2 (fixture side) and 6 → Tasks 4–6; §10 documents (`docs/16` §3.2, `contracts-spec`, `docs/10`) → Task 6. Not in this plan by design: the real turn handler contract test (Plan 3), the audio endpoint itself (Plan 2), alignment conversion (Plan 2), retrieval changes to `Repository` (Plan 5).
- **Placeholders:** none; every step has code or exact commands.
- **Type consistency:** `StreamMessage`, `Action`, `FixtureTurn`, `sendStreamMessage` and `openSse` names are identical across Tasks 1–6; fixture ids (`tl_republica`, `colosseum`, `q_augusto`) satisfy `ElementId`; `material_id` is a string in schemas, fixtures and docs.
