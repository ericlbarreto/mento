import type { AnalysisService } from "./service";

export interface SessionEndedOptions {
  retryDelayMs?: number;
  /** Injectable scheduler (tests pass a fake). */
  schedule?: (fn: () => void, ms: number) => void;
  log?: (message: string, error?: unknown) => void;
  /**
   * Whether this conversation should be analysed at all (e.g. its student is registered). Default: always.
   * Conversations of unknown students are left alone so they do not pollute the teacher's numbers.
   */
  shouldAnalyze?: (sessionId: string) => Promise<boolean>;
  /**
   * True when every answer of the conversation has been judged. The judge runs in the background after each answer,
   * so the last evidence can still be arriving when the student leaves. Default: nothing to wait for.
   */
  isSettled?: (sessionId: string) => Promise<boolean>;
  /** How long to wait for the judge before analysing anyway (a failed judgment never records evidence). Default 15 s. */
  maxWaitMs?: number;
  /** How often to check `isSettled`. Default 1 s. */
  pollMs?: number;
  /** Injectable sleep (tests pass a fake). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Trigger for `session_ended` (called by `POST /api/sessions/:id/end`).
 * Waits (briefly) for the judge, runs the analysis once and, if it failed, retries once after 30 s (handoffs §4.2).
 */
export class SessionEndedHandler {
  private readonly retryDelayMs: number;
  private readonly schedule: (fn: () => void, ms: number) => void;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly inflight = new Set<Promise<unknown>>();

  constructor(
    private readonly service: AnalysisService,
    private readonly options: SessionEndedOptions = {},
  ) {
    this.retryDelayMs = options.retryDelayMs ?? 30_000;
    this.schedule = options.schedule ?? ((fn, ms) => void setTimeout(fn, ms).unref());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms).unref()));
  }

  async handle(sessionId: string): Promise<void> {
    const job = this.run(sessionId);
    this.inflight.add(job);
    try {
      await job;
    } finally {
      this.inflight.delete(job);
    }
  }

  /** Resolves when every `handle` in progress has finished (not the scheduled retry). */
  async idle(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  private async run(sessionId: string): Promise<void> {
    try {
      if (this.options.shouldAnalyze && !(await this.options.shouldAnalyze(sessionId))) return;
      await this.waitForJudge(sessionId);
    } catch (err) {
      this.options.log?.(`could not prepare the analysis of ${sessionId}`, err);
    }
    if (await this.attempt(sessionId, false)) return;
    this.schedule(() => void this.attempt(sessionId, true), this.retryDelayMs);
  }

  private async waitForJudge(sessionId: string): Promise<void> {
    const { isSettled, maxWaitMs = 15_000, pollMs = 1_000 } = this.options;
    if (!isSettled) return;
    for (let waited = 0; waited < maxWaitMs && !(await isSettled(sessionId)); waited += pollMs) await this.sleep(pollMs);
  }

  /** true when the analysis finished (or was already done). */
  private async attempt(sessionId: string, force: boolean): Promise<boolean> {
    try {
      const { analysis } = await this.service.run(sessionId, { force });
      return analysis.status === "done";
    } catch (err) {
      this.options.log?.(`session_ended analysis of ${sessionId} threw`, err);
      return false;
    }
  }
}
