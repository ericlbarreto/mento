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
