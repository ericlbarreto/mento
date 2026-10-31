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
    chapters: { type: [chapterSchema], default: [] },
    pages: { type: Number, required: true },
    status: { type: String, enum: ["processing", "ready", "failed"], default: "processing" },
  },
  baseSchemaOptions,
);

export type MaterialDoc = InferSchemaType<typeof materialSchema>;
export const MaterialModel = model("Material", materialSchema);
