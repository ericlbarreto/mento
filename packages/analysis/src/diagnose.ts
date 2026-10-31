import type { Diagnosis, Lesson, RootCause } from "@mento/contracts";

/** Every lesson that must come before `lessonId` (BFS over `prerequisites`; cycles are safe). */
export function ancestorsOf(lessonId: string, sequence: Lesson[]): Set<string> {
  const byId = new Map(sequence.map((l) => [l.lesson_id, l]));
  const seen = new Set<string>();
  const queue = [...(byId.get(lessonId)?.prerequisites ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id) || id === lessonId) continue;
    seen.add(id);
    queue.push(...(byId.get(id)?.prerequisites ?? []));
  }
  return seen;
}

export type RootCauseFacts = Omit<RootCause, "reasoning">;

/**
 * Where does the difficulty come from? Pure graph search, no LLM.
 * A row is "weak" when it was answered wrongly, partially, or correctly only with hints.
 * - some ancestor of the lesson being studied has weak rows → `prerequisite`
 *   (root = ancestor with most incorrect + partial answers, then most hint-assisted answers, then lowest `order`)
 * - otherwise the evidence is in the lesson being studied → `current_topic`
 * - otherwise `null` (no lesson ids, or lessons outside the sequence)
 */
export function diagnose(args: {
  studying_lesson_id: string | null;
  evidence: { lesson_id: string | null; result: "correct" | "partial" | "incorrect"; independent: boolean }[];
  sequence: Lesson[];
}): { diagnosis: Diagnosis | null; root_cause: RootCauseFacts | null } {
  const { studying_lesson_id: studying, sequence } = args;
  const byId = new Map(sequence.map((l) => [l.lesson_id, l]));
  if (!studying || !byId.has(studying)) return { diagnosis: null, root_cause: null };

  const rows = args.evidence.filter((e): e is typeof e & { lesson_id: string } => !!e.lesson_id && byId.has(e.lesson_id));
  const ancestors = ancestorsOf(studying, sequence);
  const wrong = new Map<string, number>();
  const assisted = new Map<string, number>();
  for (const e of rows) {
    if (!ancestors.has(e.lesson_id)) continue;
    if (e.result !== "correct") wrong.set(e.lesson_id, (wrong.get(e.lesson_id) ?? 0) + 1);
    else if (!e.independent) assisted.set(e.lesson_id, (assisted.get(e.lesson_id) ?? 0) + 1);
  }
  const weak = new Set([...wrong.keys(), ...assisted.keys()]);

  if (weak.size > 0) {
    const root = [...weak]
      .map((id) => byId.get(id)!)
      .sort(
        (a, b) =>
          (wrong.get(b.lesson_id) ?? 0) - (wrong.get(a.lesson_id) ?? 0) ||
          (assisted.get(b.lesson_id) ?? 0) - (assisted.get(a.lesson_id) ?? 0) ||
          a.order - b.order,
      )[0]!;
    return {
      diagnosis: "prerequisite",
      root_cause: { lesson_id: root.lesson_id, title: root.title, pages: root.pages, taught_in_class: root.taught_in_class },
    };
  }
  if (rows.some((e) => e.lesson_id === studying)) return { diagnosis: "current_topic", root_cause: null };
  return { diagnosis: null, root_cause: null };
}
