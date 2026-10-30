import { z } from "zod";

/** A source the tutor cites. `quote` must occur in that page (validated server-side). */
export const Citation = z.object({
  material_id: z.string().min(1),
  page: z.number().int().min(1),
  quote: z.string().min(1).max(400),
});
export type Citation = z.infer<typeof Citation>;
