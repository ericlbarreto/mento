import { z } from "zod";

export const PingResponse = z.object({
  ok: z.literal(true),
  service: z.string(),
  time: z.string(),
});
export type PingResponse = z.infer<typeof PingResponse>;
