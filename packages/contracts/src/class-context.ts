import { z } from "zod";
import { GradeLevel } from "./student";

/** One global setting applied to every student chat (D33). No personal data in the description. */
export const ClassContext = z.object({
  grade_level: GradeLevel,
  description: z.string().max(600),
});
export type ClassContext = z.infer<typeof ClassContext>;
