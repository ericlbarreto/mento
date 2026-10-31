import mongoose from "mongoose";
import { defineModel } from "./define";

const { Schema } = mongoose;
import { snakeCaseSchemaOptions } from "../schema-options";

// Nested objects are Mixed: Zod (@mento/contracts) validates them at the boundary, not Mongoose.
const studentSchema = new Schema(
  {
    fixture_id: { type: String },
    name: { type: String, required: true },
    is_simulated: { type: Boolean, default: false },
    profile: { type: Schema.Types.Mixed },
    school_history: { type: Schema.Types.Mixed, default: [] },
    current_term: { type: Schema.Types.Mixed, default: [] },
  },
  snakeCaseSchemaOptions,
);
studentSchema.index({ fixture_id: 1 }, { unique: true, sparse: true });

export const StudentModel = defineModel("Student", studentSchema);
