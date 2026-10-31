import { Schema, model, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "../schema-options";

/** A school subject (matéria): groups the teacher's materials and selects the tutor's subject profile. */
const subjectSchema = new Schema(
  {
    name: { type: String, required: true },
    key: { type: String, required: true, unique: true },
  },
  baseSchemaOptions,
);

export type SubjectDoc = InferSchemaType<typeof subjectSchema>;
export const SubjectModel = model("Subject", subjectSchema);
