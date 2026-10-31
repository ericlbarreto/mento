import mongoose from "mongoose";
import { snakeCaseSchemaOptions } from "../schema-options";
import { defineModel } from "./define";

const { Schema } = mongoose;

/** Generated exercise lists (Person 1, D72). One document per list, questions embedded. */
const exerciseListSchema = new Schema(
  {
    title: { type: String, required: true },
    concept: { type: String, required: true },
    concept_key: { type: String, required: true },
    material_id: { type: String, default: null },
    material_title: { type: String, default: null },
    lesson_id: { type: String, default: null },
    lesson_title: { type: String, default: null },
    pages: { type: [Number], default: null },
    grade_level: { type: String, required: true },
    gap_ids: { type: [String], default: [] },
    student_count: { type: Number, default: 0 },
    status: { type: String, required: true },
    error: { type: String, default: null },
    exercises: { type: Schema.Types.Mixed, default: [] },
    model: { type: String, default: null },
    prompt_version: { type: String, required: true },
  },
  { ...snakeCaseSchemaOptions, collection: "exercise_lists" },
);
exerciseListSchema.index({ created_at: -1 });
exerciseListSchema.index({ concept_key: 1 });

export const ExerciseListModel = defineModel("ExerciseList", exerciseListSchema);
