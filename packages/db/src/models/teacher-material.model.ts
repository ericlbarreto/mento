import mongoose from "mongoose";
import { defineModel } from "./define";

const { Schema } = mongoose;
import { snakeCaseSchemaOptions } from "../schema-options";

const materialSchema = new Schema(
  {
    fixture_id: { type: String },
    title: { type: String, required: true },
    subject: { type: String, required: true },
    is_fixture: { type: Boolean, default: false },
    file: { type: Schema.Types.Mixed, default: null },
    page_count: { type: Number, default: 0 },
    status: { type: String, default: "queued" },
    progress: { type: Schema.Types.Mixed, default: { done: 0, total: 0 } },
    outline: { type: Schema.Types.Mixed, default: [] },
    sequence: { type: Schema.Types.Mixed, default: [] },
    pages_needing_ocr: { type: [Number], default: [] },
    error: { type: String, default: null },
  },
  snakeCaseSchemaOptions,
);
materialSchema.index({ fixture_id: 1 }, { unique: true, sparse: true });
materialSchema.index({ "file.sha256": 1 });

export const TeacherMaterialModel = defineModel("TeacherMaterial", materialSchema);
