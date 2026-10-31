import { z } from "zod";
import {
  AskVerificationBase,
  CircleAnnotateArgs,
  DiagramBase,
  DrawArgs,
  HighlightArgs,
  MoveElementArgs,
  RemoveElementArgs,
  SpeakBase,
  UpdateElementArgs,
  WriteTextBase,
  WriteTimelineArgs,
} from "@mento/contracts";

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  eager_input_streaming?: boolean;
}

export const SearchMaterialsArgs = z.object({
  query: z.string().min(1).max(300),
  material_id: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  k: z.number().int().min(1).max(8).optional(),
});
export type SearchMaterialsArgs = z.infer<typeof SearchMaterialsArgs>;

const jsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  return rest;
};

/**
 * Tools the tutor model may call, derived from the contracts so the model and the front-end cannot drift.
 * The order and the text are part of the prompt-cache prefix: change them deliberately.
 */
export function modelTools(): ToolDef[] {
  return [
    {
      name: "speak",
      description:
        "Say something to the student, in Brazilian Portuguese. In voice mode it is spoken aloud, so use one or two short sentences and put details on the board. Set purpose to 'hint' (with hint_level 1-3) whenever you give a hint on an open question. Cite the teacher's material in sources; set outside_material to true when you go beyond it.",
      input_schema: jsonSchema(SpeakBase),
    },
    {
      name: "write_text",
      description:
        "Write a handwritten-style text block on the board. Allowed HTML: h1-h3, p, b, i, br, ul, ol, li, span. Choose a column (main, visuals or side), never coordinates. The id must be new, short, snake_case and unique in the session. Use purpose and hint_level like speak.",
      input_schema: jsonSchema(WriteTextBase),
      eager_input_streaming: true,
    },
    {
      name: "write_timeline",
      description:
        "Write a timeline with exact dates on the board. Always use this for chronology instead of drawing dates. The id must be new and unique.",
      input_schema: jsonSchema(WriteTimelineArgs),
      eager_input_streaming: true,
    },
    {
      name: "highlight",
      description:
        "Highlight (like a highlighter pen) an element that already exists on the board, while you explain it. target_id must be an id listed in the Board section of the input. Set text_to_match to mark only a passage (it must occur in that element's text); omit it to mark the whole element. Vary the color by meaning: yellow = key idea, green = result or consequence, blue = cause or context, pink = attention or exception. For a diagram, set shape_id to highlight one of its shapes. Prefer this to circle_annotate for phrases.",
      input_schema: jsonSchema(HighlightArgs),
    },
    {
      name: "circle_annotate",
      description:
        "Circle one key word, date or number inside an element that already exists (at most about two circles per reply; mark phrases with highlight). target_id must be an existing element id and text_to_match must occur in that element's text. For a diagram, set shape_id to circle one shape (an arrow, a box, a point) and put its label in text_to_match.",
      input_schema: jsonSchema(CircleAnnotateArgs),
    },
    {
      name: "draw",
      description:
        "Add an artistic colored-pencil illustration to the board (a place, a building, an object, a process, the key person of the topic). Use it on your own when one of them first enters the lesson; at most one per reply, never a decorative scene (a student studying, a classroom, the tutor). Describe only the picture and never ask for text, labels, numbers or dates inside it (use write_text for labels). For exact figures (forces, graphs, geometry) use draw_diagram instead. The id must be new and unique.",
      input_schema: jsonSchema(DrawArgs.omit({ is_structured: true })),
      eager_input_streaming: true,
    },
    {
      name: "draw_diagram",
      description: [
        "Draw an exact, labeled diagram on the board, drawn stroke by stroke: forces on a block, a block on a ramp, vectors, a function graph, a number line, a triangle. Use it whenever the figure needs exact shapes, arrows, numbers or labels; use draw for scenes.",
        "Pick a frame (wide 160x100, square 100x100, tall 100x160); coordinates are grid units, x to the right, y DOWN, inside the frame. Up to 24 shapes, each with a short snake_case id and plain-text pt-BR labels (at most 40 characters).",
        "rect: a box (x, y = top-left, w, h); to sit it on a floor or ramp give on: {ref: <line or polyline id>} instead of x, y and the server places and tilts it. line: from, to (ground: true for a floor). arrow: start at a shape with from: {ref, side: top|bottom|left|right|center} (or from: {at: [x, y]}), point it with dir (up, down, left, right, or normal = out of the box side) or deg (counter-clockwise from right), and give magnitude (e.g. the force in N; lengths are proportional) or length s|m|l. Never compute arrow end points yourself.",
        "With an axes shape (x_range, y_range, ticks, labels), every [x, y] in the diagram is in DATA units: a polyline with smooth: true through computed points draws a function, point marks a value.",
        "highlight and circle_annotate can target one shape later with shape_id. The id must be new and unique.",
      ].join(" "),
      input_schema: jsonSchema(DiagramBase),
      eager_input_streaming: true,
    },
    {
      name: "update_element",
      description: "Replace the content of an existing text element (write_text) by id.",
      input_schema: jsonSchema(UpdateElementArgs),
    },
    {
      name: "remove_element",
      description: "Remove an existing element from the board by id (an outdated or wrong block). Never one the student is asking about.",
      input_schema: jsonSchema(RemoveElementArgs),
    },
    {
      name: "move_element",
      description:
        "Tidy the board: move an existing element to a column, right after after_id (an element already in that column), or to the top with after_id null. Use it sparingly, e.g. to put a block next to the one it extends or a side note in side, and say it aloud.",
      input_schema: jsonSchema(MoveElementArgs),
    },
    {
      name: "ask_verification",
      description:
        "Put a question for the student on the board to check understanding, then stop and wait for the answer. concept is a short pt-BR label: reuse the label of one of the student's open gaps, then a chapter title from the catalog, otherwise a new short label. kind: explain in own words, transfer to a new case, or place an event on the timeline.",
      input_schema: jsonSchema(AskVerificationBase),
    },
    {
      name: "search_materials",
      description:
        "Search the teacher's materials for passages. Use it only when the passages already given in the input are not enough, and first say a short speak such as 'Vou conferir no livro.'. At most once per reply.",
      input_schema: jsonSchema(SearchMaterialsArgs),
    },
  ];
}
