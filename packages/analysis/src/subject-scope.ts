import type { ConversationSource, Session, SubjectStore, TeacherRepository } from "@mento/contracts";

/**
 * The teacher follows one subject (D64, D67, D78): only conversations started from it count on the teacher side, and
 * only they are analysed. The whiteboard is not affected: this wraps what the teacher side reads.
 *
 * - A session with `subject_id` of another subject, or `null` (free whiteboard), is left out.
 * - A session that does not record its subject at all (`subject_id` absent: the lab fixtures) is kept.
 * - An insight or analysis is hidden when its `session_id` is a real conversation left out above; ids that are not
 *   conversations (the lab's `ses_ana_01`) are kept. Nothing is deleted.
 */
export class SubjectScope {
  private subjectId: string | null = null;
  /** session id → left out. A conversation never changes subject, so the answer is kept. */
  private readonly outside = new Map<string, boolean>();

  constructor(private readonly deps: { key: string; subjects: Pick<SubjectStore, "list">; conversations: ConversationSource }) {}

  /** The id of the subject with `key`, looked up once it exists. */
  private async resolveId(): Promise<string | null> {
    this.subjectId ??= (await this.deps.subjects.list()).find((s) => s.key === this.deps.key)?.id ?? null;
    return this.subjectId;
  }

  async includes(session: Session): Promise<boolean> {
    if (session.subject_id === undefined) return true;
    const id = await this.resolveId();
    return id !== null && session.subject_id === id;
  }

  private async keep(sessions: Session[]): Promise<Session[]> {
    const kept = await Promise.all(sessions.map((s) => this.includes(s)));
    return sessions.filter((_, i) => kept[i]);
  }

  /** Whether what was learned in `sessionId` may be shown to the teacher. */
  async visible(sessionId: string): Promise<boolean> {
    let out = this.outside.get(sessionId);
    if (out === undefined) {
      const bundle = await this.deps.conversations.getSessionBundle(sessionId);
      out = !!bundle && !(await this.includes(bundle.session));
      if (!bundle || this.subjectId !== null || bundle.session.subject_id === undefined) this.outside.set(sessionId, out);
    }
    return !out;
  }

  private async visibleOnly<T extends { session_id: string }>(items: T[]): Promise<T[]> {
    const shown = await Promise.all(items.map((i) => this.visible(i.session_id)));
    return items.filter((_, i) => shown[i]);
  }

  /** The conversations of the subject. */
  conversations(): ConversationSource {
    const source = this.deps.conversations;
    return {
      listAllSessions: async () => this.keep(await source.listAllSessions()),
      listSessionsByStudent: async (studentId) => this.keep(await source.listSessionsByStudent(studentId)),
      getSessionBundle: async (sessionId) => {
        const bundle = await source.getSessionBundle(sessionId);
        return bundle && (await this.includes(bundle.session)) ? bundle : null;
      },
    };
  }

  /** `repo` with insights and analyses of the subject only. Everything else, writes included, passes through. */
  repo(repo: TeacherRepository): TeacherRepository {
    return {
      listStudents: () => repo.listStudents(),
      getStudent: (id) => repo.getStudent(id),
      getStudentByFixtureId: (id) => repo.getStudentByFixtureId(id),
      upsertStudent: (input) => repo.upsertStudent(input),
      getClassContext: () => repo.getClassContext(),
      setClassContext: (context) => repo.setClassContext(context),
      listMaterials: () => repo.listMaterials(),
      getMaterial: (id) => repo.getMaterial(id),
      getMaterialByFixtureId: (id) => repo.getMaterialByFixtureId(id),
      findMaterialBySha256: (sha256) => repo.findMaterialBySha256(sha256),
      upsertMaterial: (input) => repo.upsertMaterial(input),
      updateMaterial: (id, patch) => repo.updateMaterial(id, patch),
      getAnalysisBySession: async (sessionId) => {
        const analysis = await repo.getAnalysisBySession(sessionId);
        return analysis && (await this.visible(sessionId)) ? analysis : null;
      },
      saveAnalysis: (record) => repo.saveAnalysis(record),
      listInsights: async (filter) => this.visibleOnly(await repo.listInsights(filter)),
      getInsight: async (id) => {
        const insight = await repo.getInsight(id);
        return insight && (await this.visible(insight.session_id)) ? insight : null;
      },
      createInsight: (draft) => repo.createInsight(draft),
      updateInsight: (id, patch) => repo.updateInsight(id, patch),
      resetTeacherData: () => repo.resetTeacherData(),
    };
  }
}
