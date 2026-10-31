import { z } from "zod";

/** Response of POST /api/voice/token: everything the browser needs to open the Deepgram WebSocket. */
export const VoiceTokenResponse = z.object({
  token: z.string().min(1),
  expires_in: z.number().int().min(1),
  ws_url: z.string().url(),
  params: z.record(z.string(), z.string()),
});
export type VoiceTokenResponse = z.infer<typeof VoiceTokenResponse>;
