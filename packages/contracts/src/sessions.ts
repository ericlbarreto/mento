import { z } from "zod";

export const CreateSessionRequest = z.object({
  student_id: z.string().min(1),
  modality: z.enum(["text", "voice"]),
  topic: z.string().max(120).optional(),
  /** The subject the student clicked. Omitted or null: a free whiteboard that searches all materials. */
  subject_id: z.string().min(1).nullable().optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const CreateSessionResponse = z.object({ id: z.string().min(1), subject_id: z.string().min(1).nullable() });
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

export const EndSessionRequest = z.object({ reason: z.enum(["user_left", "idle_timeout", "beacon", "manual"]) });
export type EndSessionRequest = z.infer<typeof EndSessionRequest>;
