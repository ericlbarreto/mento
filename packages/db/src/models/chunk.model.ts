import { Schema, model, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "../schema-options";

/** One passage (~400 tokens inside a single page) of a material, with its embedding. */
const chunkSchema = new Schema(
  {
    material_id: { type: String, required: true },
    subject: { type: String, required: true },
    chapter: { type: String },
    page: { type: Number, required: true },
    passage_idx: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true, select: false },
  },
  baseSchemaOptions,
);
chunkSchema.index({ material_id: 1, page: 1, passage_idx: 1 });

export type ChunkDoc = InferSchemaType<typeof chunkSchema>;
export const ChunkModel = model("Chunk", chunkSchema);
