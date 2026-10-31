import { z } from "zod";
import { StreamMessage } from "./stream";

/** A recorded turn: each message is delivered `at_ms` after the start of the replay. */
export const FixtureTurn = z.object({
  description: z.string().min(1),
  messages: z.array(z.object({ at_ms: z.number().int().min(0), message: StreamMessage })).min(1),
});
export type FixtureTurn = z.infer<typeof FixtureTurn>;
