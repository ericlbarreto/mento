import { z } from "zod";
import { ElementId } from "./actions";

/** The only event list (contracts-spec section 3). Payload shapes per type live with their writers. */
export const EventType = z.enum([
  "session_started", "user_message", "tutor_action", "verification_asked", "verification_answered",
  "hint_given", "evidence_recorded", "interrupted", "mic_state", "turn_timing", "session_ended", "session_resumed",
  "board_element_removed", "board_element_moved", "board_element_placed",
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
