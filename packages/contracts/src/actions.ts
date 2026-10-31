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
