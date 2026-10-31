import { z } from "zod";
import {
  AskVerificationBase,
  CircleAnnotateArgs,
  DrawArgs,
  HighlightArgs,
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
      description: "Highlight an element that already exists on the board. target_id must be an id listed in the Board section of the input.",
      input_schema: jsonSchema(HighlightArgs),
    },
    {
      name: "circle_annotate",
      description:
        "Circle a piece of text inside an element that already exists. target_id must be an existing element id and text_to_match must occur in that element's text.",
      input_schema: jsonSchema(CircleAnnotateArgs),
    },
    {
      name: "draw",
      description:
        "Add an illustration to the board. With is_structured=false it is an artistic colored-pencil image; describe only the picture and never ask for text, labels or dates inside it (use write_text for labels). The id must be new and unique.",
      input_schema: jsonSchema(DrawArgs),
      eager_input_streaming: true,
    },
    {
      name: "update_element",
      description: "Replace the content of an existing text element (write_text) by id.",
      input_schema: jsonSchema(UpdateElementArgs),
    },
    {
      name: "remove_element",
      description: "Remove an existing element from the board by id.",
      input_schema: jsonSchema(RemoveElementArgs),
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
