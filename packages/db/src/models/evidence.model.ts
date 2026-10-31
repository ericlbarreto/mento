import { Schema, model, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "../schema-options";

const citationSchema = new Schema(
  { material_id: { type: String, required: true }, page: { type: Number, required: true }, quote: { type: String, required: true } },
  { _id: false },
);

/** A judged answer to a verification question (contracts-spec §5): the raw material for the teacher's insights. */
const evidenceSchema = new Schema(
  {
    session_id: { type: String, required: true, index: true },
    student_id: { type: String, required: true, index: true },
    concept: { type: String, required: true },
    concept_key: { type: String, required: true, index: true },
    result: { type: String, enum: ["correct", "partial", "incorrect"], required: true },
    independent: { type: Boolean, required: true },
    hints_used: { type: Number, required: true },
    rationale: { type: String, required: true },
    citation: { type: citationSchema, default: null },
    ts: { type: Date, default: () => new Date() },
  },
  baseSchemaOptions,
);

export type EvidenceDoc = InferSchemaType<typeof evidenceSchema>;
export const EvidenceModel = model("Evidence", evidenceSchema);
