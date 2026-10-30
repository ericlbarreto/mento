import { z } from "zod";

export const HealthResponse = z.object({
  ok: z.boolean(),
  service: z.literal("mento-api"),
  time: z.string(),
  mongo: z.enum(["disconnected", "connected", "connecting", "disconnecting"]),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
