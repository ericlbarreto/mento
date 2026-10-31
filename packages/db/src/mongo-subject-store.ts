import mongoose from "mongoose";
import type { CreateSubjectRequest, MaterialSummary, Subject, SubjectStore, SubjectSummary } from "@mento/contracts";
import { MaterialModel } from "./models/material.model";
import { SubjectModel } from "./models/subject.model";

export class SubjectKeyTakenError extends Error {
  constructor(key: string) {
    super(`a subject with key "${key}" already exists`);
    this.name = "SubjectKeyTakenError";
  }
}

interface SubjectLean {
  _id: unknown;
  name: string;
  key: string;
}
interface MaterialLean {
  _id: unknown;
  title: string;
  pages: number;
  status: MaterialSummary["status"];
  subject_id?: string | null;
}

const toSubject = (d: SubjectLean): Subject => ({ id: String(d._id), name: d.name, key: d.key });

export class MongoSubjectStore implements SubjectStore {
  private async summaries(subjects: SubjectLean[]): Promise<SubjectSummary[]> {
    const ids = subjects.map((s) => String(s._id));
    const materials = await MaterialModel.find({ subject_id: { $in: ids }, status: "ready" })
      .sort({ createdAt: 1 })
      .lean<MaterialLean[]>();
    return subjects.map((s) => {
      const own = materials
        .filter((m) => m.subject_id === String(s._id))
        .map((m) => ({ id: String(m._id), title: m.title, pages: m.pages, status: m.status }));
      return { ...toSubject(s), material_count: own.length, materials: own };
    });
  }

  async list(): Promise<SubjectSummary[]> {
    const subjects = await SubjectModel.find().sort({ name: 1 }).lean<SubjectLean[]>();
    return this.summaries(subjects);
  }

  async get(id: string): Promise<SubjectSummary | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    const subject = await SubjectModel.findById(id).lean<SubjectLean | null>();
    return subject ? ((await this.summaries([subject]))[0] ?? null) : null;
  }

  async create(input: CreateSubjectRequest): Promise<Subject> {
    if (await SubjectModel.exists({ key: input.key })) throw new SubjectKeyTakenError(input.key);
    const doc = await SubjectModel.create(input);
    return { id: String(doc._id), name: input.name, key: input.key };
  }

  async upsertByKey(key: string, name: string): Promise<Subject> {
    const doc = await SubjectModel.findOneAndUpdate({ key }, { $setOnInsert: { key, name } }, { upsert: true, returnDocument: "after" }).lean<SubjectLean>();
    return toSubject(doc);
  }
}
