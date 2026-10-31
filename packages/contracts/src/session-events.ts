import { z } from "zod";
import { Citation } from "./citation";
import { Column, ElementId } from "./actions";
import { EvidenceResult } from "./evidence";

/** contracts-spec §2–3: the only event taxonomy. `SessionEvent` is the typed form (payload per type, with `seq`) read by the analysis; `Event` in ./events is the loose envelope. `seq` (1-based, unique per session) gives the analysis a stable order. */
const envelope = { id: z.string(), session_id: z.string(), seq: z.number().int().positive(), ts: z.string() };

function event<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({ ...envelope, type: z.literal(type), payload });
}

/** Names of the typed session events (apart from the loose `Event` envelope used by the turn route). */
export const SessionEventTypes = [
  "session_started",
  "user_message",
  "tutor_action",
  "verification_asked",
  "verification_answered",
  "hint_given",
  "evidence_recorded",
  "interrupted",
  "mic_state",
  "turn_timing",
  "session_ended",
  "session_resumed",
  "board_element_removed",
  "board_element_moved",
] as const;
export type SessionEventType = (typeof SessionEventTypes)[number];

export const SessionEndReason = z.enum(["user_left", "idle_timeout", "beacon", "manual"]);
export type SessionEndReason = z.infer<typeof SessionEndReason>;

export const SessionEvent = z.discriminatedUnion("type", [
  event(
    "session_started",
    z.object({
      student_id: z.string(),
      material_id: z.string().nullable().optional(),
      subject_id: z.string().nullable().optional(),
      lesson_id: z.string().nullable().optional(),
      topic: z.string().optional(),
      modality: z.enum(["text", "voice"]),
      persona: z.string().optional(),
    }),
  ),
  event(
    "user_message",
    z.object({
      kind: z.enum(["chat", "speech", "board_select", "quick_action"]),
      text: z.string(),
      selected: z.object({ element_id: z.string(), text: z.string().optional() }).optional(),
    }),
  ),
  event(
    "tutor_action",
    z.object({
      turn_id: z.string(),
      action_id: z.string(),
      order: z.number().int(),
      name: z.string(),
      args: z.record(z.string(), z.unknown()),
    }),
  ),
  event(
    "verification_asked",
    z.object({
      verification_id: z.string(),
      element_id: z.string(),
      concept: z.string(),
      concept_key: z.string(),
      lesson_id: z.string().nullable().optional(),
      question: z.string(),
      kind: z.string(),
    }),
  ),
  event(
    "verification_answered",
    z.object({ verification_id: z.string(), element_id: z.string(), answer: z.string() }),
  ),
  event(
    "hint_given",
    z.object({
      turn_id: z.string(),
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      verification_id: z.string().optional(),
      concept_key: z.string().optional(),
    }),
  ),
  event(
    "evidence_recorded",
    z.object({
      evidence_id: z.string(),
      verification_id: z.string().optional(),
      concept: z.string(),
      concept_key: z.string(),
      result: EvidenceResult,
      independent: z.boolean(),
      hints_used: z.number().int().nonnegative(),
      rationale: z.string(),
      citation: Citation.optional(),
    }),
  ),
  event("interrupted", z.object({ turn_id: z.string(), action_id: z.string().optional() })),
  event("mic_state", z.object({ muted: z.boolean() })),
  event(
    "turn_timing",
    z.object({
      turn_id: z.string(),
      first_action_ms: z.number(),
      last_action_ms: z.number(),
      tts_first_audio_ms: z.number().optional(),
      image_ready_ms: z.number().optional(),
    }),
  ),
  event("session_ended", z.object({ reason: SessionEndReason })),
  event("session_resumed", z.object({ previous_ended_at: z.string() })),
  // Student board edits (plan F, D79). Never read by the analysis (rule 6).
  event("board_element_removed", z.object({ element_id: ElementId, edit_id: z.string() })),
  event("board_element_moved", z.object({ element_id: ElementId, column: Column, after_id: ElementId.nullable(), edit_id: z.string() })),
]);
export type SessionEvent = z.infer<typeof SessionEvent>;
export type SessionEventOf<T extends SessionEventType> = Extract<SessionEvent, { type: T }>;
