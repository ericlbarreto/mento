import type { Analysis, AnalysisRecord, Insight, InsightDraft, InsightFilter } from "./insights";
import type { ClassContext } from "./class-context";
import type { Material, MaterialInput } from "./material";
import type { SessionBundle, Session } from "./session";
import type { Student, StudentInput } from "./student";

/**
 * Persistence used by the teacher side (Person 1). One in-memory and one MongoDB implementation (@mento/db).
 * Materials live in the shared `materials` collection; their embedded passages are the whiteboard's `ChunkStore`.
 */
export interface TeacherRepository {
  listStudents(): Promise<Student[]>;
  getStudent(id: string): Promise<Student | null>;
  getStudentByFixtureId(fixtureId: string): Promise<Student | null>;
  /** Upserts by `fixture_id` when present, otherwise inserts. */
  upsertStudent(input: StudentInput): Promise<Student>;

  getClassContext(): Promise<ClassContext | null>;
  setClassContext(context: ClassContext): Promise<ClassContext>;

  listMaterials(): Promise<Material[]>;
  getMaterial(id: string): Promise<Material | null>;
  getMaterialByFixtureId(fixtureId: string): Promise<Material | null>;
  findMaterialBySha256(sha256: string): Promise<Material | null>;
  /** Upserts by `fixture_id` when present, otherwise inserts. */
  upsertMaterial(input: MaterialInput): Promise<Material>;
  updateMaterial(id: string, patch: Partial<MaterialInput>): Promise<Material | null>;


  getAnalysisBySession(sessionId: string): Promise<Analysis | null>;
  /** Upserts by `session_id`. */
  saveAnalysis(record: AnalysisRecord): Promise<Analysis>;

  listInsights(filter?: InsightFilter): Promise<Insight[]>;
  getInsight(id: string): Promise<Insight | null>;
  createInsight(draft: InsightDraft): Promise<Insight>;
  updateInsight(id: string, patch: Partial<InsightDraft>): Promise<Insight | null>;

  /** Deletes only the teacher-side collections (students, class context, analyses, insights) and fixture materials. */
  resetTeacherData(): Promise<void>;
}

/**
 * Source of the tutoring conversations. Today: a JSON file (`FileConversationSource`).
 * Later: MongoDB collections written by the whiteboard (Person 3), behind the same interface.
 */
export interface ConversationSource {
  /** All sessions, oldest first. */
  listAllSessions(): Promise<Session[]>;
  /** Sessions of one student, oldest first. */
  listSessionsByStudent(studentId: string): Promise<Session[]>;
  getSessionBundle(sessionId: string): Promise<SessionBundle | null>;
}
