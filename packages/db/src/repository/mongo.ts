import mongoose from "mongoose";
import {
  Material,
  MaterialInput,
  StudentInput,
  type Analysis,
  type AnalysisRecord,
  type ClassContext,
  type Insight,
  type InsightDraft,
  type InsightFilter,
  type Student,
  type TeacherRepository,
} from "@mento/contracts";
import { AnalysisModel, ClassContextModel, InsightModel, MaterialModel, StudentModel } from "../models";

/** Lean Mongo document → contract object: `_id` → `id`, Dates → ISO strings, `__v` dropped. */
function plain<T>(doc: unknown): T {
  const { _id, __v: _version, ...rest } = doc as Record<string, unknown>;
  const out: Record<string, unknown> = { id: String(_id), ...rest };
  for (const key of ["created_at", "updated_at"]) {
    if (out[key] instanceof Date) out[key] = (out[key] as Date).toISOString();
  }
  return out as T;
}

const maybe = <T>(doc: unknown): T | null => (doc ? plain<T>(doc) : null);

/**
 * The `materials` collection is shared with the whiteboard back-end, whose documents use `createdAt` and may lack the
 * upload fields. Map it to the contract (snake_case timestamps, defaults for missing fields).
 */
function toMaterial(doc: unknown): Material {
  const { createdAt, updatedAt, ...rest } = plain<Record<string, unknown>>(doc);
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "string" ? v : new Date(0).toISOString());
  return Material.parse({ ...rest, created_at: iso(createdAt), updated_at: iso(updatedAt) });
}
const maybeMaterial = (doc: unknown): Material | null => (doc ? toMaterial(doc) : null);
const validId = (id: string) => mongoose.isValidObjectId(id);
const upsertOptions = { upsert: true, returnDocument: "after", lean: true, setDefaultsOnInsert: true } as const;

/** MongoDB implementation (Mongoose). Requires `connectMongo` to have been called. */
export class MongoRepository implements TeacherRepository {
  async listStudents() {
    const docs = await StudentModel.find().sort({ created_at: 1, _id: 1 }).lean();
    return docs.map((d) => plain<Student>(d));
  }
  async getStudent(id: string) {
    if (!validId(id)) return null;
    return maybe<Student>(await StudentModel.findById(id).lean());
  }
  async getStudentByFixtureId(fixtureId: string) {
    return maybe<Student>(await StudentModel.findOne({ fixture_id: fixtureId }).lean());
  }
  async upsertStudent(input: Parameters<TeacherRepository["upsertStudent"]>[0]) {
    const data = StudentInput.parse(input);
    if (data.fixture_id) {
      return plain<Student>(await StudentModel.findOneAndUpdate({ fixture_id: data.fixture_id }, { $set: data }, upsertOptions));
    }
    return plain<Student>((await StudentModel.create(data)).toObject());
  }

  async getClassContext() {
    const doc = await ClassContextModel.findOne({ key: "default" }).lean();
    return doc ? ({ grade_level: doc.grade_level, description: doc.description } as ClassContext) : null;
  }
  async setClassContext(context: ClassContext) {
    await ClassContextModel.findOneAndUpdate({ key: "default" }, { $set: context }, upsertOptions);
    return context;
  }

  async listMaterials() {
    const docs = await MaterialModel.find().sort({ createdAt: 1, _id: 1 }).lean();
    return docs.map((d) => toMaterial(d));
  }
  async getMaterial(id: string) {
    if (!validId(id)) return null;
    return maybeMaterial(await MaterialModel.findById(id).lean());
  }
  async getMaterialByFixtureId(fixtureId: string) {
    return maybeMaterial(await MaterialModel.findOne({ fixture_id: fixtureId }).lean());
  }
  async findMaterialBySha256(sha256: string) {
    return maybeMaterial(await MaterialModel.findOne({ "file.sha256": sha256 }).lean());
  }
  async upsertMaterial(input: Parameters<TeacherRepository["upsertMaterial"]>[0]) {
    const data = MaterialInput.parse(input);
    if (data.fixture_id) {
      return toMaterial(await MaterialModel.findOneAndUpdate({ fixture_id: data.fixture_id }, { $set: data }, upsertOptions));
    }
    return toMaterial((await MaterialModel.create(data)).toObject());
  }
  async updateMaterial(id: string, patch: Parameters<TeacherRepository["updateMaterial"]>[1]) {
    if (!validId(id)) return null;
    return maybeMaterial(await MaterialModel.findByIdAndUpdate(id, { $set: patch }, { returnDocument: "after", lean: true }));
  }

  async getAnalysisBySession(sessionId: string) {
    return maybe<Analysis>(await AnalysisModel.findOne({ session_id: sessionId }).lean());
  }
  async saveAnalysis(record: AnalysisRecord) {
    return plain<Analysis>(await AnalysisModel.findOneAndUpdate({ session_id: record.session_id }, { $set: record }, upsertOptions));
  }

  async listInsights(filter: InsightFilter = {}) {
    const query: Record<string, unknown> = {};
    if (filter.student_id) query.student_id = filter.student_id;
    if (filter.session_id) query.session_id = filter.session_id;
    if (filter.kind) query.kind = filter.kind;
    if (filter.severity) query.severity = filter.severity;
    if (filter.status) query.status = { $in: filter.status };
    if (filter.concept_key) query.concept_key = filter.concept_key;
    const docs = await InsightModel.find(query).sort({ updated_at: -1, _id: -1 }).lean();
    return docs.map((d) => plain<Insight>(d));
  }
  async getInsight(id: string) {
    if (!validId(id)) return null;
    return maybe<Insight>(await InsightModel.findById(id).lean());
  }
  async createInsight(draft: InsightDraft) {
    return plain<Insight>((await InsightModel.create(draft)).toObject());
  }
  async updateInsight(id: string, patch: Partial<InsightDraft>) {
    if (!validId(id)) return null;
    return maybe<Insight>(await InsightModel.findByIdAndUpdate(id, { $set: patch }, { returnDocument: "after", lean: true }));
  }

  async resetTeacherData() {
    await Promise.all([
      StudentModel.deleteMany({}),
      ClassContextModel.deleteMany({}),
      // Only fixture materials: real materials (and their passages) belong to the whiteboard catalog and stay.
      MaterialModel.deleteMany({ is_fixture: true }),
      AnalysisModel.deleteMany({}),
      InsightModel.deleteMany({}),
    ]);
  }

  /** Create the indexes declared in the models (run once at seed time or in integration tests). */
  async syncIndexes() {
    await Promise.all([
      StudentModel.syncIndexes(),
      ClassContextModel.syncIndexes(),
      MaterialModel.syncIndexes(),
      AnalysisModel.syncIndexes(),
      InsightModel.syncIndexes(),
    ]);
  }
}
