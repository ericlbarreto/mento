import mongoose from "mongoose";
import { defineModel } from "./define";

const { Schema } = mongoose;
import { snakeCaseSchemaOptions } from "../schema-options";

const chunkSchema = new Schema(
  {
    material_id: { type: String, required: true },
    page: { type: Number, required: true },
    chunk_index: { type: Number, required: true },
    chapter: { type: String, default: null },
    text: { type: String, required: true },
    text_norm: { type: String, required: true },
  },
  snakeCaseSchemaOptions,
);
chunkSchema.index({ material_id: 1, page: 1, chunk_index: 1 });
// `text_norm` is lowercase and accent-free, so "república" and "republica" match.
chunkSchema.index({ text_norm: "text" }, { default_language: "portuguese" });

export const TeacherChunkModel = defineModel("TeacherChunk", chunkSchema);
