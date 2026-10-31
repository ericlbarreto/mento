import mongoose from "mongoose";
import { defineModel } from "./define";

const { Schema } = mongoose;
import { snakeCaseSchemaOptions } from "../schema-options";

const analysisSchema = new Schema(
  {
    session_id: { type: String, required: true },
    student_id: { type: String, required: true },
    status: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    input_hash: { type: String, default: null },
    rules_version: { type: String, required: true },
    writer: { type: String, default: null },
    prompt_version: { type: String, default: null },
    skip_reason: { type: String, default: null },
    studying_lesson_id: { type: String, default: null },
    counters: { type: Schema.Types.Mixed, default: null },
    findings: { type: Schema.Types.Mixed, default: [] },
    summary: { type: String, default: null },
    rejections: { type: Schema.Types.Mixed, default: [] },
    insight_ids: { type: [String], default: [] },
    error: { type: String, default: null },
    started_at: { type: String, default: null },
    finished_at: { type: String, default: null },
  },
  snakeCaseSchemaOptions,
);
analysisSchema.index({ session_id: 1 }, { unique: true });
analysisSchema.index({ student_id: 1 });

export const AnalysisModel = defineModel("Analysis", analysisSchema);
