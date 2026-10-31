import type { AnalysisService } from "./service";

export interface SessionEndedOptions {
  retryDelayMs?: number;
  /** Injectable scheduler (tests pass a fake). */
  schedule?: (fn: () => void, ms: number) => void;
  log?: (message: string, error?: unknown) => void;
}

/**
 * Trigger for `session_ended` (called by Person 3's `POST /api/sessions/:id/end`).
 * Runs the analysis once and, if it failed, retries once after 30 s (handoffs §4.2).
 */
export class SessionEndedHandler {
  private readonly retryDelayMs: number;
  private readonly schedule: (fn: () => void, ms: number) => void;

  constructor(
    private readonly service: AnalysisService,
    private readonly options: SessionEndedOptions = {},
  ) {
    this.retryDelayMs = options.retryDelayMs ?? 30_000;
    this.schedule = options.schedule ?? ((fn, ms) => void setTimeout(fn, ms).unref());
  }

  async handle(sessionId: string): Promise<void> {
    if (await this.attempt(sessionId, false)) return;
    this.schedule(() => void this.attempt(sessionId, true), this.retryDelayMs);
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
