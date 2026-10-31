import { randomBytes } from "node:crypto";
import {
  MaterialInput,
  StudentInput,
  normalizeConcept,
  type Analysis,
  type AnalysisRecord,
  type TextChunk,
  type ClassContext,
  type Insight,
  type InsightDraft,
  type InsightFilter,
  type Material,
  type Student,
  type TeacherRepository,
} from "@mento/contracts";

export interface MemoryRepositoryOptions {
  /** Injectable clock (ISO string) so tests are deterministic. */
  now?: () => string;
}

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em", "um", "uma", "para", "por", "com", "que", "no", "na", "nos", "nas", "ao", "se"]);

function stems(text: string): string[] {
  return normalizeConcept(text)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .map((t) => t.slice(0, 6));
}

const newId = () => randomBytes(12).toString("hex");
const clone = <T>(value: T): T => structuredClone(value);

/** In-memory implementation: same contract as MongoRepository, used by unit and API tests. */
export class MemoryRepository implements TeacherRepository {
  private students = new Map<string, Student>();
  private classContext: ClassContext | null = null;
  private materials = new Map<string, Material>();
  private chunks = new Map<string, TextChunk[]>();
  private analyses = new Map<string, Analysis>(); // by session_id
  private insights = new Map<string, Insight>();
  private insightSeq = new Map<string, number>();
  private seq = 0;
  private readonly now: () => string;

  constructor(options: MemoryRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async listStudents() {
    return [...this.students.values()].map(clone);
  }
  async getStudent(id: string) {
    const s = this.students.get(id);
    return s ? clone(s) : null;
  }
  async getStudentByFixtureId(fixtureId: string) {
    const s = [...this.students.values()].find((x) => x.fixture_id === fixtureId);
    return s ? clone(s) : null;
  }
  async upsertStudent(input: Parameters<TeacherRepository["upsertStudent"]>[0]) {
    const data = StudentInput.parse(input);
    const existing = data.fixture_id ? [...this.students.values()].find((s) => s.fixture_id === data.fixture_id) : undefined;
    const ts = this.now();
    const student: Student = existing
      ? { ...existing, ...data, id: existing.id, created_at: existing.created_at, updated_at: ts }
      : { ...data, id: newId(), created_at: ts, updated_at: ts };
    this.students.set(student.id, student);
    return clone(student);
  }

  async getClassContext() {
    return this.classContext ? clone(this.classContext) : null;
  }
  async setClassContext(context: ClassContext) {
    this.classContext = clone(context);
    return clone(context);
  }

  async listMaterials() {
    return [...this.materials.values()].map(clone);
  }
  async getMaterial(id: string) {
    const m = this.materials.get(id);
    return m ? clone(m) : null;
  }
  async getMaterialByFixtureId(fixtureId: string) {
    const m = [...this.materials.values()].find((x) => x.fixture_id === fixtureId);
    return m ? clone(m) : null;
  }
  async findMaterialBySha256(sha256: string) {
    const m = [...this.materials.values()].find((x) => x.file?.sha256 === sha256);
    return m ? clone(m) : null;
  }
  async upsertMaterial(input: Parameters<TeacherRepository["upsertMaterial"]>[0]) {
    const data = MaterialInput.parse(input);
    const existing = data.fixture_id ? [...this.materials.values()].find((m) => m.fixture_id === data.fixture_id) : undefined;
    const ts = this.now();
    const material: Material = existing
      ? { ...existing, ...data, id: existing.id, created_at: existing.created_at, updated_at: ts }
      : { ...data, id: newId(), created_at: ts, updated_at: ts };
    this.materials.set(material.id, material);
    return clone(material);
  }
  async updateMaterial(id: string, patch: Parameters<TeacherRepository["updateMaterial"]>[1]) {
    const existing = this.materials.get(id);
    if (!existing) return null;
    const updated: Material = { ...existing, ...clone(patch), id, updated_at: this.now() } as Material;
    this.materials.set(id, updated);
    return clone(updated);
  }

  async replaceChunks(materialId: string, chunks: TextChunk[]) {
    this.chunks.set(materialId, chunks.map(clone));
  }
  async searchChunks(materialId: string, query: string, k: number) {
    const wanted = new Set(stems(query));
    if (wanted.size === 0) return [];
    return (this.chunks.get(materialId) ?? [])
      .map((chunk) => {
        const have = new Set(stems(chunk.text_norm));
        return { chunk, score: [...wanted].filter((s) => have.has(s)).length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.chunk.page - b.chunk.page || a.chunk.chunk_index - b.chunk.chunk_index)
      .slice(0, k)
      .map((x) => clone(x.chunk));
  }
  async getPages(materialId: string, pages: number[]) {
    return (this.chunks.get(materialId) ?? [])
      .filter((c) => pages.includes(c.page))
      .sort((a, b) => a.page - b.page || a.chunk_index - b.chunk_index)
      .map(clone);
  }

  async getAnalysisBySession(sessionId: string) {
    const a = this.analyses.get(sessionId);
    return a ? clone(a) : null;
  }
  async saveAnalysis(record: AnalysisRecord) {
    const existing = this.analyses.get(record.session_id);
    const ts = this.now();
    const analysis: Analysis = existing
      ? { ...clone(record), id: existing.id, created_at: existing.created_at, updated_at: ts }
      : { ...clone(record), id: newId(), created_at: ts, updated_at: ts };
    this.analyses.set(record.session_id, analysis);
    return clone(analysis);
  }

  async listInsights(filter: InsightFilter = {}) {
    return [...this.insights.values()]
      .filter(
        (i) =>
          (!filter.student_id || i.student_id === filter.student_id) &&
          (!filter.session_id || i.session_id === filter.session_id) &&
          (!filter.kind || i.kind === filter.kind) &&
          (!filter.severity || i.severity === filter.severity) &&
          (!filter.status || filter.status.includes(i.status)) &&
          (!filter.concept_key || i.concept_key === filter.concept_key),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || (this.insightSeq.get(b.id) ?? 0) - (this.insightSeq.get(a.id) ?? 0))
      .map(clone);
  }
  async getInsight(id: string) {
    const i = this.insights.get(id);
    return i ? clone(i) : null;
  }
  async createInsight(draft: InsightDraft) {
    const ts = this.now();
    const insight: Insight = { ...clone(draft), id: newId(), created_at: ts, updated_at: ts };
    this.insights.set(insight.id, insight);
    this.insightSeq.set(insight.id, ++this.seq);
    return clone(insight);
  }
  async updateInsight(id: string, patch: Partial<InsightDraft>) {
    const existing = this.insights.get(id);
    if (!existing) return null;
    const updated: Insight = { ...existing, ...clone(patch), id, updated_at: this.now() };
    this.insights.set(id, updated);
    return clone(updated);
  }

  async resetTeacherData() {
    this.students.clear();
    this.classContext = null;
    this.materials.clear();
    this.chunks.clear();
    this.analyses.clear();
    this.insights.clear();
    this.insightSeq.clear();
  }
}
