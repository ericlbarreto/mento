import mongoose from "mongoose";
import { defineModel } from "./define";

const { Schema } = mongoose;
import { snakeCaseSchemaOptions } from "../schema-options";

// Singleton: one global class context (D33).
const classContextSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    grade_level: { type: String, required: true },
    description: { type: String, default: "" },
  },
  snakeCaseSchemaOptions,
);

export const ClassContextModel = defineModel("ClassContext", classContextSchema);
