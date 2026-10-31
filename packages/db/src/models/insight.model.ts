import mongoose from "mongoose";
import { defineModel } from "./define";

const { Schema } = mongoose;
import { snakeCaseSchemaOptions } from "../schema-options";

const insightSchema = new Schema(
  {
    student_id: { type: String, required: true },
    session_id: { type: String, required: true },
    analysis_id: { type: String, required: true },
    kind: { type: String, required: true },
    severity: { type: String, required: true },
    rule: { type: String, required: true },
    rules_version: { type: String, required: true },
    concept: { type: String, required: true },
    concept_key: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    confidence: { type: Number, required: true },
    evidence: { type: Schema.Types.Mixed, default: [] },
    diagnosis: { type: String, default: null },
    root_cause: { type: Schema.Types.Mixed, default: null },
    studying_lesson_id: { type: String, default: null },
    related_gap_id: { type: String, default: null },
    material_ref: { type: Schema.Types.Mixed, default: null },
    metrics: { type: Schema.Types.Mixed, required: true },
    source: { type: String, required: true },
    status: { type: String, required: true },
  },
  snakeCaseSchemaOptions,
);
insightSchema.index({ student_id: 1, status: 1, severity: 1 });
insightSchema.index({ student_id: 1, concept_key: 1, kind: 1 });
insightSchema.index({ severity: 1, created_at: -1 });

export const InsightModel = defineModel("Insight", insightSchema);
