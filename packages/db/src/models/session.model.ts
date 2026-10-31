import { Schema, model, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "../schema-options";

const subjectSnapshot = new Schema(
  { id: { type: String, required: true }, name: { type: String, required: true }, key: { type: String, required: true } },
  { _id: false },
);

/** One whiteboard conversation. `subject` is a snapshot of the subject it was started from (null = free whiteboard). */
const sessionSchema = new Schema(
  {
    student_id: { type: String, required: true, index: true },
    modality: { type: String, enum: ["text", "voice"], required: true },
    subject: { type: subjectSnapshot, default: null },
    subject_id: { type: String, default: null, index: true },
    topic: { type: String },
    /** The student's first message (or the topic), cut to 80 characters. */
    title: { type: String, default: null },
    started_at: { type: Date, default: () => new Date() },
    last_activity_at: { type: Date, default: () => new Date(), index: true },
    ended_at: { type: Date, default: null },
    end_reason: { type: String, default: null },
    turn_count: { type: Number, default: 0 },
  },
  baseSchemaOptions,
);

export type SessionDoc = InferSchemaType<typeof sessionSchema>;
export const SessionModel = model("Session", sessionSchema);
