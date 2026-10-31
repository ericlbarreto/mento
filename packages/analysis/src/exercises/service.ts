import {
  normalizeConcept,
  sequenceOf,
  type ChunkStore,
  type ConversationSource,
  type CreateExerciseListBody,
  type Exercise,
  type ExerciseList,
  type ExerciseListStore,
  type Insight,
  type Lesson,
  type Material,
  type TeacherEvent,
  type TeacherRepository,
  type UpdateExerciseListBody,
} from "@mento/contracts";
import { EXERCISES_PROMPT_VERSION, checkList, type ExerciseGenerator, type ExerciseSource } from "./generator";

/** At most this many pages of the book go into the prompt (a lesson rarely needs more to write 5 questions). */
export const MAX_PAGES = 12;

export class ExerciseListError extends Error {
  constructor(
    readonly code: "invalid_gaps" | "generator_unavailable" | "not_found" | "not_ready",
    message: string,
  ) {
    super(message);
  }
}

export interface ExerciseListServiceDeps {
  lists: ExerciseListStore;
  repo: TeacherRepository;
  conversations: ConversationSource;
  chunks: ChunkStore;
  /** null when ANTHROPIC_API_KEY is not set: creating a list answers 503. */
  generator: ExerciseGenerator | null;
  emit?: (event: TeacherEvent) => void;
  log?: (message: string, error?: unknown) => void;
}

const mostCommon = <T>(items: T[], key: (t: T) => string): T | null => {
  const counts = new Map<string, { n: number; item: T }>();
  for (const item of items) counts.set(key(item), { n: (counts.get(key(item))?.n ?? 0) + 1, item });
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.item ?? null;
};

/**
 * Exercise lists for a topic the class struggles with (D72): the teacher asks from an intervention, the list is created
 * as "generating", Claude writes it in the background from the lesson of the book, and the feed reports when it is ready.
 */
export class ExerciseListService {
  private readonly inflight = new Set<Promise<unknown>>();

  constructor(private readonly deps: ExerciseListServiceDeps) {}

  get available(): boolean {
    return this.deps.generator !== null;
  }

  async create(body: CreateExerciseListBody): Promise<ExerciseList> {
    const generator = this.deps.generator;
    if (!generator) throw new ExerciseListError("generator_unavailable", "ANTHROPIC_API_KEY is not set");
    const gaps = (await Promise.all(body.gap_ids.map((id) => this.deps.repo.getInsight(id)))).filter((g): g is Insight => !!g && g.kind === "gap");
    if (gaps.length === 0) throw new ExerciseListError("invalid_gaps", "no open gap among gap_ids");

    const { material, lesson, pages } = await this.whereItStarts(gaps);
    const context = await this.deps.repo.getClassContext();
    const list = await this.deps.lists.create({
      title: `Lista de exercícios: ${body.concept}`,
      concept: body.concept,
      concept_key: normalizeConcept(body.concept),
      material_id: material?.id ?? null,
      material_title: material?.title ?? null,
      lesson_id: lesson?.lesson_id ?? null,
      lesson_title: lesson?.title ?? null,
      pages,
      grade_level: context?.grade_level ?? "8º ano",
      gap_ids: gaps.map((g) => g.id),
      student_count: new Set(gaps.map((g) => g.student_id)).size,
      status: "generating",
      error: null,
      exercises: [],
      model: generator.model,
      prompt_version: EXERCISES_PROMPT_VERSION,
      edited_at: null,
    });
    this.emit(list);

    const source: ExerciseSource = {
      concept: body.concept,
      grade_level: list.grade_level,
      class_description: context?.description ?? "",
      lesson: lesson ? { title: lesson.title, summary: lesson.summary, key_concepts: lesson.key_concepts } : null,
      passages: [],
    };
    const job = this.generate(list.id, generator, source, material, pages);
    this.inflight.add(job);
    void job.finally(() => this.inflight.delete(job));
    return list;
  }

  /**
   * The teacher's edit (D83): the new title and the whole list of questions, in order. Only a ready list (a generating
   * one would be overwritten by the generator). Ids are re-assigned q1, q2, … so they stay unique.
   */
  async edit(id: string, body: UpdateExerciseListBody, now = () => new Date().toISOString()): Promise<ExerciseList> {
    const list = await this.deps.lists.get(id);
    if (!list) throw new ExerciseListError("not_found", "exercise list not found");
    if (list.status !== "ready") throw new ExerciseListError("not_ready", `exercise list is ${list.status}`);
    const exercises: Exercise[] = body.exercises.map((q, i) => ({
      id: `q${i + 1}`,
      kind: q.kind,
      prompt: q.prompt,
      ...(q.kind === "choice" && q.options ? { options: q.options } : {}),
      answer: q.answer,
      explanation: q.explanation,
      page: q.page,
    }));
    const saved = await this.deps.lists.update(id, { title: body.title, exercises, edited_at: now() });
    if (!saved) throw new ExerciseListError("not_found", "exercise list not found");
    this.emit(saved);
    return saved;
  }

  /** Resolves when every generation in progress has finished (tests). */
  async idle(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  private async generate(id: string, generator: ExerciseGenerator, source: ExerciseSource, material: Material | null, pages: [number, number] | null) {
    try {
      source.passages = material && pages ? await this.passages(material.id, pages) : [];
      const out = await generator.generate(source);
      const problem = checkList(out);
      if (problem) throw new Error(problem);
      const exercises: Exercise[] = out.questions.map((q, i) => ({
        id: `q${i + 1}`,
        kind: q.kind,
        prompt: q.prompt,
        ...(q.kind === "choice" && q.options ? { options: q.options } : {}),
        answer: q.answer,
        explanation: q.explanation,
        page: q.page,
      }));
      this.emit(await this.deps.lists.update(id, { status: "ready", exercises, error: null, ...(out.title.trim() ? { title: out.title.trim() } : {}) }));
    } catch (err) {
      this.deps.log?.(`exercise list ${id} failed`, err);
      this.emit(await this.deps.lists.update(id, { status: "failed", error: err instanceof Error ? err.message : String(err) }));
    }
  }

  /** The book, the lesson and the pages where the class's difficulty most often starts. */
  private async whereItStarts(gaps: Insight[]): Promise<{ material: Material | null; lesson: Lesson | null; pages: [number, number] | null }> {
    const bundles = await Promise.all([...new Set(gaps.map((g) => g.session_id))].map((id) => this.deps.conversations.getSessionBundle(id)));
    const origin = mostCommon(
      gaps.flatMap((g) =>
        g.root_cause ? [{ lesson_id: g.root_cause.lesson_id, title: g.root_cause.title as string | null, pages: g.root_cause.pages }] : g.material_ref ? [{ ...g.material_ref, title: null }] : [],
      ),
      (o) => o.lesson_id,
    );
    const materialId = mostCommon(bundles.flatMap((b) => (b?.session.material_id ? [b.session.material_id] : [])), (m) => m);
    // The conversation names the book. When it cannot be read (an old or seeded conversation), the gap's own lesson of
    // origin does: the material whose sequence has that lesson (same id and title).
    const material =
      (materialId ? await this.deps.repo.getMaterial(materialId) : null) ??
      (origin
        ? ((await this.deps.repo.listMaterials()).find((m) => sequenceOf(m).some((l) => l.lesson_id === origin.lesson_id && (!origin.title || l.title === origin.title))) ?? null)
        : null);
    const lesson = material && origin ? (sequenceOf(material).find((l) => l.lesson_id === origin.lesson_id) ?? null) : null;
    return { material, lesson, pages: lesson?.pages ?? origin?.pages ?? null };
  }

  private async passages(materialId: string, [from, to]: [number, number]) {
    const out: { page: number; text: string }[] = [];
    for (let page = from; page <= Math.min(to, from + MAX_PAGES - 1); page++) {
      const chunks = await this.deps.chunks.getPagePassages(materialId, page);
      if (chunks.length) out.push({ page, text: chunks.map((c) => c.text).join("\n") });
    }
    return out;
  }

  private emit(list: ExerciseList | null) {
    if (list) this.deps.emit?.({ type: "exercise_list_status", list_id: list.id, status: list.status });
  }
}
