import { Lesson, lessonsFromChapters, type OutlineItem } from "@mento/contracts";
import { z } from "zod";

export interface SequenceLlm {
  complete: (request: { system: string; user: string }) => Promise<string>;
}

/** Without an LLM: the outline order is the teaching order and each lesson depends on the previous one. */
export const fallbackSequence = lessonsFromChapters;

const SYSTEM = `You turn a book outline into a lesson sequence for a teacher. Reply with a JSON array only.
Each item: {lesson_id, order, title, pages:[start,end], taught_in_class:false, summary, key_concepts[], activities[], prerequisites[]}.
Keep the outline order and page ranges. "prerequisites" lists lesson_ids of EARLIER lessons the lesson depends on. Write summaries in Brazilian Portuguese.`;

function valid(lessons: Lesson[], outline: OutlineItem[]): boolean {
  if (lessons.length !== outline.length) return false;
  const ids = new Set(lessons.map((l) => l.lesson_id));
  if (ids.size !== lessons.length) return false;
  return lessons.every((l, i) => l.order === i + 1 && l.prerequisites.every((p) => ids.has(p) && lessons.find((x) => x.lesson_id === p)!.order < l.order));
}

/** LLM-assisted sequence (summaries, concepts, real prerequisites); falls back to `fallbackSequence` on any problem. */
export async function extractSequence(args: { outline: OutlineItem[]; pages: string[]; llm?: SequenceLlm | undefined }): Promise<Lesson[]> {
  const fallback = fallbackSequence(args.outline);
  if (!args.llm || args.outline.length === 0) return fallback;
  try {
    const sections = args.outline.map((o) => ({ title: o.title, pages: [o.start_page, o.end_page], opening: (args.pages[o.start_page - 1] ?? "").slice(0, 600) }));
    const raw = await args.llm.complete({ system: SYSTEM, user: JSON.stringify(sections) });
    const text = raw.trim();
    const lessons = z.array(Lesson).parse(JSON.parse(/^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text)?.[1] ?? text));
    return valid(lessons, args.outline) ? lessons.map((l) => ({ ...l, taught_in_class: false })) : fallback;
  } catch {
    return fallback;
  }
}
