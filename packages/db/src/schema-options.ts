import type { SchemaOptions } from "mongoose";

/**
 * Options every Mento schema uses, so documents look the same in the API:
 * - `timestamps` adds `createdAt` / `updatedAt`
 * - `toJSON` exposes `_id` as `id: string` (contracts use string ids, D46) and hides `__v`
 * Usage: `new Schema({ ... }, baseSchemaOptions)`
 */
export const baseSchemaOptions: SchemaOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
};
