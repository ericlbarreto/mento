import mongoose, { type Model, type Schema } from "mongoose";

/** A model whose documents are plain objects validated by Zod at the boundary, so Mongoose does not type them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UntypedModel = Model<any>;

/** Register a model once (safe under hot reload). */
export function defineModel(name: string, schema: Schema): UntypedModel {
  return (mongoose.models[name] as UntypedModel | undefined) ?? (mongoose.model(name, schema) as unknown as UntypedModel);
}
