import type { Action, Chunk, Retriever, StreamMessage, WordTiming } from "@mento/contracts";

/** Structural subset of `TtsService` (Plan 2). */
export interface TtsStarter {
  start(req: { action_id: string; text: string }): Promise<{ words: WordTiming[]; first_byte_ms: number | null; audio_bytes: number; cached: boolean }>;
  cancel?(action_id: string): void;
}

/** Starts an image/diagram job for a `draw` action; resolves with the late messages to send (Plan 4). */
export interface DrawPipeline {
  start(action: Extract<Action, { name: "draw" }>, ctx: { session_id: string; signal: AbortSignal }): Promise<StreamMessage[]>;
}
export const noopDraw: DrawPipeline = { start: async () => [] };

export interface JudgeInput {
  session_id: string;
  student_id: string;
  verification_id: string;
  element_id: string;
  answer: string;
}
/** Records evidence for a student's answer (Plan 4). Runs in the background. */
export interface Judge {
  start(input: JudgeInput): Promise<void>;
}
export const noopJudge: Judge = { start: async () => undefined };

/** Used until the real retriever exists (Plan 5): finds nothing and trusts no citation. */
export const emptyRetriever: Retriever = {
  searchChunks: async (): Promise<Chunk[]> => [],
  validateCitation: async () => false,
};
