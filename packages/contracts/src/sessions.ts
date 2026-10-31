import { z } from "zod";

export const CreateSessionRequest = z.object({
  student_id: z.string().min(1),
  modality: z.enum(["text", "voice"]),
  topic: z.string().max(120).optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const CreateSessionResponse = z.object({ id: z.string().min(1) });
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

export const EndSessionRequest = z.object({ reason: z.enum(["user_left", "idle_timeout", "beacon", "manual"]) });
export type EndSessionRequest = z.infer<typeof EndSessionRequest>;
