import { Schema, model, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "../schema-options";

const chapterSchema = new Schema(
  { title: { type: String, required: true }, start_page: { type: Number, required: true }, end_page: { type: Number, required: true } },
  { _id: false },
);

const materialSchema = new Schema(
  {
    title: { type: String, required: true },
    subject: { type: String, required: true, index: true },
    /** The subject (matéria) document this material belongs to. */
    subject_id: { type: String, index: true },
    chapters: { type: [chapterSchema], default: [] },
    pages: { type: Number, required: true },
    status: { type: String, enum: ["queued", "processing", "ready", "failed"], default: "processing" },

    // ---- Added by the teacher upload (Person 1). Optional: materials ingested by `pnpm ingest` simply do not have them. ----
    /** The uploaded PDF (kept so a restart can re-run the ingestion) and its sha256 (no duplicate uploads). */
    file: { type: Schema.Types.Mixed, default: null },
    /** Where the ingestion is: stage (queued, extracting, embedding, done) and done/total. */
    progress: { type: Schema.Types.Mixed },
    /** Lessons in teaching order with prerequisites: the analysis traces a difficulty back through them. */
    sequence: { type: Schema.Types.Mixed },
    pages_needing_ocr: { type: [Number] },
    toc_pages: { type: [Number] },
    /** Number of embedded passages stored in `chunks`. */
    passages: { type: Number },
    error: { type: String, default: null },
    /** Fixture materials (lab data) are never shown to the tutor. */
    is_fixture: { type: Boolean },
    fixture_id: { type: String },
  },
  baseSchemaOptions,
);
materialSchema.index({ fixture_id: 1 }, { unique: true, sparse: true });
materialSchema.index({ "file.sha256": 1 });

export type MaterialDoc = InferSchemaType<typeof materialSchema>;
export const MaterialModel = model("Material", materialSchema);
