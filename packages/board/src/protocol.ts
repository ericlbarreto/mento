// Local Zod mirror of the turn protocol (docs/16 §3–4, workstreams/contracts-spec.md).
// Lets the whiteboard front-end run before `@mento/contracts` is filled in; Person 3 can copy it there.
// snake_case fields, closed enums, strict objects (unknown keys such as camelCase typos are rejected).
// Shapes marked "PROPOSAL" are not in contracts-spec.md yet.
import { z } from "zod";

// ---- Primitives ----

/** Material/student/session ids: MongoDB ObjectId as 24-hex (spec §1). */
export const ObjectIdString = z.string().regex(/^[0-9a-f]{24}$/);
export type ObjectIdString = z.infer<typeof ObjectIdString>;

/** Board element / action / turn / verification ids (`el_…`, `title`, `act_…`, `turn_…`, `ver_…`). */
const LocalId = z.string().min(1);

export const Column = z.enum(["main", "visuals", "side"]);
export type Column = z.infer<typeof Column>;

export const HighlightColor = z.enum(["yellow", "blue"]);
export type HighlightColor = z.infer<typeof HighlightColor>;

export const AnnotateColor = z.enum(["blue", "orange", "red"]);
export type AnnotateColor = z.infer<typeof AnnotateColor>;

/** Spec §4. */
export const Citation = z.strictObject({
  material_id: ObjectIdString,
  page: z.int().min(1),
  quote: z.string().min(1),
});
export type Citation = z.infer<typeof Citation>;

/** Spec §6. */
export const SpeechPurpose = z.enum(["explain", "hint", "praise", "question", "transition"]);
export type SpeechPurpose = z.infer<typeof SpeechPurpose>;

export const HintLevel = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type HintLevel = z.infer<typeof HintLevel>;

const hintNeedsLevel = (a: { purpose?: SpeechPurpose; hint_level?: HintLevel }) =>
  a.purpose !== "hint" || a.hint_level !== undefined;
const hintNeedsLevelError = { message: "hint_level is required when purpose is \"hint\"", path: ["hint_level"] };

// ---- Tool args (docs/16 §4) ----

export const SpeakArgs = z
  .strictObject({
    text: z.string().min(1),
    style: z.string().min(1).optional(),
    purpose: SpeechPurpose.optional(),
    hint_level: HintLevel.optional(),
    sources: z.array(Citation).optional(),
    outside_material: z.boolean().optional(),
  })
  .refine(hintNeedsLevel, hintNeedsLevelError);
export type SpeakArgs = z.infer<typeof SpeakArgs>;

export const WriteTextArgs = z
  .strictObject({
    id: LocalId,
    html: z.string().min(1),
    column: Column,
    purpose: SpeechPurpose.optional(),
    hint_level: HintLevel.optional(),
    sources: z.array(Citation).optional(),
    outside_material: z.boolean().optional(),
  })
  .refine(hintNeedsLevel, hintNeedsLevelError);
export type WriteTextArgs = z.infer<typeof WriteTextArgs>;

export const TimelineEvent = z.strictObject({ date: z.string().min(1), label: z.string().min(1) });
export type TimelineEvent = z.infer<typeof TimelineEvent>;

export const WriteTimelineArgs = z.strictObject({
  id: LocalId,
  column: Column,
  events: z.array(TimelineEvent).min(1),
});
export type WriteTimelineArgs = z.infer<typeof WriteTimelineArgs>;

export const WriteLatexArgs = z.strictObject({ id: LocalId, latex: z.string().min(1), column: Column });
export type WriteLatexArgs = z.infer<typeof WriteLatexArgs>;

export const HighlightArgs = z.strictObject({ target_id: LocalId, color: HighlightColor });
export type HighlightArgs = z.infer<typeof HighlightArgs>;

export const CircleAnnotateArgs = z.strictObject({
  target_id: LocalId,
  text_to_match: z.string().min(1),
  color: AnnotateColor,
});
export type CircleAnnotateArgs = z.infer<typeof CircleAnnotateArgs>;

export const DrawArgs = z.strictObject({
  id: LocalId,
  prompt: z.string().min(1),
  column: Column,
  is_structured: z.boolean(),
  max_dimensions: z.strictObject({ w: z.int().positive(), h: z.int().positive() }),
});
export type DrawArgs = z.infer<typeof DrawArgs>;

/** Late result for a `draw` placeholder: one of `url` / `svg` is required. */
export const DrawResultArgs = z
  .strictObject({
    element_id: LocalId,
    url: z.string().min(1).optional(),
    svg: z.string().min(1).optional(),
  })
  .refine((a) => a.url !== undefined || a.svg !== undefined, { message: "draw_result needs url or svg" });
export type DrawResultArgs = z.infer<typeof DrawResultArgs>;

export const UpdateElementArgs = z.strictObject({ id: LocalId, html: z.string().min(1) });
export type UpdateElementArgs = z.infer<typeof UpdateElementArgs>;

export const RemoveElementArgs = z.strictObject({ id: LocalId });
export type RemoveElementArgs = z.infer<typeof RemoveElementArgs>;

export const VerificationKind = z.enum(["explain", "transfer", "place_on_timeline"]);
export type VerificationKind = z.infer<typeof VerificationKind>;

export const AskVerificationArgs = z.strictObject({
  // PROPOSAL for Person 3: `id`, `verification_id` and `choices` are not in docs/16 §4 yet.
  // The client needs element_id + verification_id to send `answer_submit` (spec §3).
  id: LocalId,
  verification_id: LocalId,
  concept: z.string().min(1),
  question: z.string().min(1),
  kind: VerificationKind,
  choices: z.array(z.string().min(1)).optional(),
});
export type AskVerificationArgs = z.infer<typeof AskVerificationArgs>;

// ---- Tutor actions (client-rendered; record_evidence and search_materials are server-side only) ----

const action = <N extends string, A extends z.ZodType>(name: N, args: A) =>
  z.strictObject({ id: LocalId, name: z.literal(name), args });

export const TutorAction = z.discriminatedUnion("name", [
  action("speak", SpeakArgs),
  action("write_text", WriteTextArgs),
  action("write_timeline", WriteTimelineArgs),
  action("write_latex", WriteLatexArgs),
  action("highlight", HighlightArgs),
  action("circle_annotate", CircleAnnotateArgs),
  action("draw", DrawArgs),
  action("draw_result", DrawResultArgs),
  action("update_element", UpdateElementArgs),
  action("remove_element", RemoveElementArgs),
  action("ask_verification", AskVerificationArgs),
]);
export type TutorAction = z.infer<typeof TutorAction>;
export type TutorActionName = TutorAction["name"];

// ---- Turn stream: one SSE message (docs/16 §3.2) ----

/** PROPOSAL for Person 3: first message of a turn, so the client can send `interrupted.turn_id`. */
export const TurnStartMessage = z.strictObject({ turn_id: LocalId });
export type TurnStartMessage = z.infer<typeof TurnStartMessage>;

export const ActionMessage = z.strictObject({ order: z.int().min(0), action: TutorAction });
export type ActionMessage = z.infer<typeof ActionMessage>;

export const SvgChunkMessage = z.strictObject({ stream: z.literal("svg"), element_id: LocalId, chunk: z.string() });
export type SvgChunkMessage = z.infer<typeof SvgChunkMessage>;

export const DoneMessage = z.strictObject({ done: z.literal(true) });
export type DoneMessage = z.infer<typeof DoneMessage>;

/** PROPOSAL for Person 3: a turn that failed server-side. */
export const ErrorMessage = z.strictObject({ error: z.strictObject({ message: z.string() }) });
export type ErrorMessage = z.infer<typeof ErrorMessage>;

export const TurnStreamMessage = z.union([TurnStartMessage, ActionMessage, SvgChunkMessage, DoneMessage, ErrorMessage]);
export type TurnStreamMessage = z.infer<typeof TurnStreamMessage>;

// ---- Client → server (spec §3, docs/16 §3.1) ----

export const UserMessageKind = z.enum(["chat", "speech", "board_select", "quick_action"]);
export type UserMessageKind = z.infer<typeof UserMessageKind>;

export const UserMessage = z.strictObject({
  kind: UserMessageKind,
  text: z.string(),
  selected: z.strictObject({ element_id: LocalId, text: z.string().optional() }).optional(),
});
export type UserMessage = z.infer<typeof UserMessage>;

export const AnswerSubmit = z.strictObject({
  verification_id: LocalId,
  element_id: LocalId,
  answer: z.string(),
});
export type AnswerSubmit = z.infer<typeof AnswerSubmit>;

export const Interrupted = z.strictObject({
  turn_id: LocalId,
  action_id: LocalId.optional(),
  spoken_chars: z.int().min(0).optional(),
});
export type Interrupted = z.infer<typeof Interrupted>;

export const Modality = z.enum(["text", "voice"]);
export type Modality = z.infer<typeof Modality>;

export const AppendedItem = z.discriminatedUnion("name", [
  UserMessage.extend({ name: z.literal("user_message") }),
  AnswerSubmit.extend({ name: z.literal("answer_submit") }),
]);
export type AppendedItem = z.infer<typeof AppendedItem>;

export const TurnRequest = z.strictObject({
  appended: z.array(AppendedItem).min(1),
  modality: Modality,
  interrupted: Interrupted.optional(),
});
export type TurnRequest = z.infer<typeof TurnRequest>;

export const SessionEndReason = z.enum(["user_left", "idle_timeout", "beacon", "manual"]);
export type SessionEndReason = z.infer<typeof SessionEndReason>;

export const EndSessionRequest = z.strictObject({ reason: SessionEndReason });
export type EndSessionRequest = z.infer<typeof EndSessionRequest>;

// ---- Start screen (docs/16 §11) ----

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

export const CreateSessionRequest = z.strictObject({
  student_id: ObjectIdString,
  material_id: ObjectIdString,
  topic: z.string().min(1).optional(),
  persona: z.string().min(1).optional(),
  modality: Modality,
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const CreateSessionResponse = z.strictObject({ id: ObjectIdString });
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;
