// Mirror of Person 3's planned @mento/contracts (PR #5, plan wb-1). Delete this file and import from @mento/contracts once it lands.
// Sections follow their files: citation.ts, actions.ts, speech.ts, stream.ts, events.ts, fixtures.ts.
// The start-screen shapes at the end are Person 1's, not in PR #5.
import { z } from "zod";

// ---- citation.ts ----

/** A source the tutor cites. `quote` must occur in that page (validated server-side). */
export const Citation = z.object({
  material_id: z.string().min(1),
  page: z.number().int().min(1),
  quote: z.string().min(1).max(400),
});
export type Citation = z.infer<typeof Citation>;

// ---- actions.ts ----

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

// ---- speech.ts ----

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

// ---- stream.ts ----

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

// ---- events.ts ----

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

// ---- fixtures.ts ----

/** A recorded turn: each message is delivered `at_ms` after the start of the replay. */
export const FixtureTurn = z.object({
  description: z.string().min(1),
  messages: z.array(z.object({ at_ms: z.number().int().min(0), message: StreamMessage })).min(1),
});
export type FixtureTurn = z.infer<typeof FixtureTurn>;

// ---- Start screen and session lifecycle: Person 1, not in PR #5 (docs/16 §11, contracts-spec §3) ----

/** MongoDB ObjectId as 24-hex (spec §1). */
const ObjectIdString = z.string().regex(/^[0-9a-f]{24}$/);

export const StudentSummary = z.strictObject({ id: ObjectIdString, name: z.string().min(1) });
export type StudentSummary = z.infer<typeof StudentSummary>;

export const MaterialStatus = z.enum(["queued", "processing", "ready", "failed"]);
export type MaterialStatus = z.infer<typeof MaterialStatus>;

/** PROPOSAL for Person 1: the MaterialSummary fields. */
export const MaterialSummary = z.strictObject({
  id: ObjectIdString,
  title: z.string().min(1),
  subject: z.string().min(1),
  pages: z.int().min(0),
  status: MaterialStatus,
});
export type MaterialSummary = z.infer<typeof MaterialSummary>;

// PR #5 (decision D50) creates sessions with `student_id` only; `material_id` stays here until that is settled.
export const CreateSessionRequest = z.strictObject({
  student_id: ObjectIdString,
  material_id: ObjectIdString,
  topic: z.string().min(1).optional(),
  persona: z.string().min(1).optional(),
  modality: z.enum(["text", "voice"]),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const CreateSessionResponse = z.strictObject({ id: ObjectIdString });
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

export const SessionEndReason = z.enum(["user_left", "idle_timeout", "beacon", "manual"]);
export type SessionEndReason = z.infer<typeof SessionEndReason>;

export const EndSessionRequest = z.strictObject({ reason: SessionEndReason });
export type EndSessionRequest = z.infer<typeof EndSessionRequest>;
