import { randomBytes } from "node:crypto";
import {
  normalizeConcept,
  type CatalogRecord,
  type Chunk,
  type ChunkFilter,
  type ChunkStore,
  type CreateSubjectRequest,
  type MaterialRecord,
  type PassageRecord,
  type Subject,
  type SubjectStore,
  type SubjectSummary,
  type TeacherRepository,
} from "@mento/contracts";

/**
 * In-memory versions of the whiteboard's `ChunkStore` and `SubjectStore` (tests and demos without Atlas).
 * They read and write materials through a `TeacherRepository`, exactly like the MongoDB ones share the `materials` collection.
 */

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em", "um", "uma", "para", "por", "com", "que", "no", "na", "nos", "nas", "ao", "se"]);
const stems = (text: string) =>
  normalizeConcept(text)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .map((t) => t.slice(0, 6));

const cosine = (a: number[], b: number[]) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

const toChunk = (p: PassageRecord, score?: number): Chunk => ({
  id: `${p.material_id}:${p.page}:${p.passage_idx}`,
  material_id: p.material_id,
  subject: p.subject,
  chapter: p.chapter,
  page: p.page,
  passage_idx: p.passage_idx,
  text: p.text,
  score,
});

const matches = (p: PassageRecord, f: ChunkFilter) =>
  (!f.material_id || p.material_id === f.material_id) && (!f.material_ids || f.material_ids.includes(p.material_id)) && (!f.subject || p.subject === f.subject);

export class MemoryChunkStore implements ChunkStore {
  private passages: PassageRecord[] = [];

  constructor(private readonly repo: TeacherRepository) {}

  /** Passages stored for a material (tests). */
  passagesOf(material_id: string): PassageRecord[] {
    return this.passages.filter((p) => p.material_id === material_id);
  }

  async vectorSearch(vector: number[], limit: number, filter: ChunkFilter) {
    if (filter.material_ids?.length === 0) return [];
    return this.passages
      .filter((p) => matches(p, filter))
      .map((p) => ({ p, score: cosine(vector, p.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => toChunk(x.p, x.score));
  }

  async textSearch(query: string, limit: number, filter: ChunkFilter) {
    if (filter.material_ids?.length === 0) return [];
    const wanted = new Set(stems(query));
    return this.passages
      .filter((p) => matches(p, filter))
      .map((p) => ({ p, score: [...wanted].filter((s) => new Set(stems(p.text)).has(s)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => toChunk(x.p, x.score));
  }

  async getPagePassages(material_id: string, page: number) {
    return this.passages
      .filter((p) => p.material_id === material_id && p.page === page)
      .sort((a, b) => a.passage_idx - b.passage_idx)
      .map((p) => toChunk(p));
  }

  async insertPassages(passages: PassageRecord[]) {
    this.passages.push(...passages.map((p) => structuredClone(p)));
  }

  async deletePassages(material_id: string) {
    this.passages = this.passages.filter((p) => p.material_id !== material_id);
  }

  async createMaterial(material: MaterialRecord) {
    const created = await this.repo.upsertMaterial({ ...material });
    return { id: created.id };
  }

  async updateMaterial(id: string, patch: Partial<MaterialRecord>) {
    await this.repo.updateMaterial(id, patch);
  }

  async listCatalog(subject_id?: string): Promise<CatalogRecord[]> {
    return (await this.repo.listMaterials())
      .filter((m) => m.status === "ready" && !m.is_fixture && (!subject_id || m.subject_id === subject_id))
      .map((m) => ({
        material_id: m.id,
        title: m.title,
        subject: m.subject,
        ...(m.subject_id ? { subject_id: m.subject_id } : {}),
        chapters: m.chapters.map((c) => c.title),
      }));
  }
}

export class MemorySubjectStore implements SubjectStore {
  private subjects: Subject[] = [];

  constructor(private readonly repo: TeacherRepository) {}

  private async summaries(subjects: Subject[]): Promise<SubjectSummary[]> {
    const materials = (await this.repo.listMaterials()).filter((m) => m.status === "ready" && !m.is_fixture);
    return subjects.map((s) => {
      const own = materials.filter((m) => m.subject_id === s.id).map((m) => ({ id: m.id, title: m.title, pages: m.pages, status: m.status as "ready" }));
      return { ...s, material_count: own.length, materials: own };
    });
  }

  async list() {
    return this.summaries([...this.subjects].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async get(id: string) {
    const subject = this.subjects.find((s) => s.id === id);
    return subject ? ((await this.summaries([subject]))[0] ?? null) : null;
  }

  async create(input: CreateSubjectRequest) {
    if (this.subjects.some((s) => s.key === input.key)) throw Object.assign(new Error(`a subject with key "${input.key}" already exists`), { name: "SubjectKeyTakenError" });
    const subject = { id: randomBytes(12).toString("hex"), name: input.name, key: input.key };
    this.subjects.push(subject);
    return subject;
  }

  async upsertByKey(key: string, name: string) {
    return this.subjects.find((s) => s.key === key) ?? this.create({ key, name });
  }
}
