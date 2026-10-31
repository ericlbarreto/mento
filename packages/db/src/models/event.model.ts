import { Schema, model, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "../schema-options";

/** One entry of a session's append-only log (`EventType` in @mento/contracts); ordered by `_id`. */
const eventSchema = new Schema(
  {
    session_id: { type: String, required: true },
    ts: { type: Date, required: true },
    type: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: null },
  },
  { ...baseSchemaOptions, minimize: false },
);
eventSchema.index({ session_id: 1, _id: 1 });

export type EventDoc = InferSchemaType<typeof eventSchema>;
export const EventModel = model("Event", eventSchema);
