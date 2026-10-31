import { z } from "zod";

/** Body of every error response from the API (`error` is a stable code, `message` is for developers). */
export const ErrorResponse = z.object({ error: z.string().min(1), message: z.string().optional() });
export type ErrorResponse = z.infer<typeof ErrorResponse>;
