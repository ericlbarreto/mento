import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { ExerciseList, type ExerciseListDraft, type ExerciseListStore } from "@mento/contracts";
import { ExerciseListModel } from "./models";

/** Lean document → contract (`_id` → `id`, Date timestamps → ISO strings). */
function toList(doc: unknown): ExerciseList {
  const { _id, __v: _v, ...rest } = doc as Record<string, unknown>;
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
  return ExerciseList.parse({ ...rest, id: String(_id), created_at: iso(rest.created_at), updated_at: iso(rest.updated_at) });
}

/** `exercise_lists` in MongoDB. */
export class MongoExerciseListStore implements ExerciseListStore {
  async create(draft: ExerciseListDraft) {
    return toList((await ExerciseListModel.create(draft)).toObject());
  }
  async update(id: string, patch: Partial<ExerciseListDraft>) {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await ExerciseListModel.findByIdAndUpdate(id, { $set: patch }, { returnDocument: "after", lean: true });
    return doc ? toList(doc) : null;
  }
  async get(id: string) {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await ExerciseListModel.findById(id).lean();
    return doc ? toList(doc) : null;
  }
  async list() {
    return (await ExerciseListModel.find().sort({ created_at: -1 }).lean()).map(toList);
  }
  async delete(id: string) {
    if (!mongoose.isValidObjectId(id)) return false;
    return (await ExerciseListModel.deleteOne({ _id: id })).deletedCount === 1;
  }
}

/** In-memory twin for tests. */
export class MemoryExerciseListStore implements ExerciseListStore {
  private lists = new Map<string, ExerciseList>();
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async create(draft: ExerciseListDraft) {
    const at = this.now();
    const list: ExerciseList = { ...structuredClone(draft), id: randomBytes(12).toString("hex"), created_at: at, updated_at: at };
    this.lists.set(list.id, list);
    return structuredClone(list);
  }
  async update(id: string, patch: Partial<ExerciseListDraft>) {
    const list = this.lists.get(id);
    if (!list) return null;
    const next = { ...list, ...structuredClone(patch), updated_at: this.now() };
    this.lists.set(id, next);
    return structuredClone(next);
  }
  async get(id: string) {
    const list = this.lists.get(id);
    return list ? structuredClone(list) : null;
  }
  async list() {
    return [...this.lists.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((l) => structuredClone(l));
  }
  async delete(id: string) {
    return this.lists.delete(id);
  }
}
