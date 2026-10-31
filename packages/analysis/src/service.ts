import {
  RULES_VERSION,
  sequenceOf,
  type AnalysisInput,
  WriterOutput,
  type Analysis,
  type AnalysisRecord,
  type ConversationSource,
  type Insight,
  type Rejection,
  type SessionBundle,
  type TeacherEvent,
  type TeacherRepository,
} from "@mento/contracts";
import { canonicalJson, sha256 } from "./canonical";
import { composeInsights } from "./guardrails";
import { buildAnalysisInput } from "./input";
import type { AnalysisWriter } from "./llm-writer";
import { persistInsights } from "./persist";
import { computeFindings } from "./rules";
import { TEMPLATE_VERSION, templateWrite } from "./template-writer";

/** `code` lets callers recognise it without `instanceof` (the class can be loaded twice by different module loaders). */
export class AnalysisNotFoundError extends Error {
  readonly code = "not_found";
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "AnalysisNotFoundError";
  }
}

export interface AnalysisServiceDeps {
  repo: TeacherRepository;
  conversations: ConversationSource;
  /** Optional LLM that rewrites text. Without it the deterministic template is used. */
  writer?: AnalysisWriter | undefined;
  now?: () => string;
  emit?: (event: TeacherEvent) => void;
  log?: (message: string, error?: unknown) => void;
}

export interface RunOptions {
  /** Recompute even when a finished analysis with the same input hash exists. */
  force?: boolean;
}

export interface RunResult {
  analysis: Analysis;
  /** true when the stored result for the same input hash was returned without recomputing. */
  cached: boolean;
  /** Insights created or updated by this run. */
  insights: Insight[];
}

/**
 * Conversation → insights. A pure function of (conversations, material, class context) plus the writer:
 * rules fix severity, diagnosis and confidence; text comes from the template or a validated LLM draft.
 */
/** Hash of everything that determines the output: the input, the rules version and the writer. */
export function analysisInputHash(input: AnalysisInput, writer: { id: string; version: string }, rulesVersion = RULES_VERSION): string {
  return sha256(canonicalJson({ input, rules_version: rulesVersion, writer }));
}

export class AnalysisService {
  private readonly inflight = new Set<Promise<unknown>>();
  /** Per-session queue: two requests for the same session never interleave (one would see the other half-done). */
  private readonly locks = new Map<string, Promise<unknown>>();
  /** The row returned by the `start` that is currently handling a session (a second normal `start` reuses it). */
  private readonly gates = new Map<string, Promise<Analysis>>();
  private readonly now: () => string;

  constructor(private readonly deps: AnalysisServiceDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  private writerKey() {
    const w = this.deps.writer;
    return w ? { id: w.id, version: w.prompt_version } : { id: "template", version: TEMPLATE_VERSION };
  }

  private async loadHistory(trigger: SessionBundle): Promise<SessionBundle[]> {
    const sessions = await this.deps.conversations.listSessionsByStudent(trigger.session.student_id);
    const bundles = await Promise.all(
      sessions.filter((s) => s.started_at <= trigger.session.started_at && s.id !== trigger.session.id).map((s) => this.deps.conversations.getSessionBundle(s.id)),
    );
    return bundles.filter((b): b is SessionBundle => b !== null);
  }

  private record(base: Partial<AnalysisRecord> & Pick<AnalysisRecord, "session_id" | "student_id" | "status">): AnalysisRecord {
    const w = this.writerKey();
    return {
      attempts: 0, input_hash: null, rules_version: RULES_VERSION, writer: w.id, prompt_version: w.version, skip_reason: null,
      studying_lesson_id: null, counters: null, findings: [], summary: null, rejections: [], insight_ids: [], error: null,
      started_at: null, finished_at: null,
      ...base,
    };
  }

  private async save(record: AnalysisRecord): Promise<Analysis> {
    const saved = await this.deps.repo.saveAnalysis(record);
    this.deps.emit?.({ type: "analysis_status", session_id: saved.session_id, student_id: saved.student_id, status: saved.status });
    return saved;
  }

  private serial<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    const next = (this.locks.get(sessionId) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.locks.set(sessionId, next);
    void next.then(
      () => this.locks.get(sessionId) === next && this.locks.delete(sessionId),
      () => this.locks.get(sessionId) === next && this.locks.delete(sessionId),
    );
    return next;
  }

  /** Runs the analysis now. Failures after the session was found are stored (`status: "failed"`), not thrown. */
  run(sessionId: string, options: RunOptions = {}): Promise<RunResult> {
    return this.serial(sessionId, () => this.execute(sessionId, options));
  }

  private async execute(sessionId: string, options: RunOptions): Promise<RunResult> {
    const { repo, conversations } = this.deps;
    const trigger = await conversations.getSessionBundle(sessionId);
    if (!trigger) throw new AnalysisNotFoundError(`session ${sessionId}`);
    // A conversation that cited no source has no material: it is still analysed, just without a lesson graph.
    const material = trigger.session.material_id ? await repo.getMaterial(trigger.session.material_id) : null;
    if (trigger.session.material_id && !material) throw new AnalysisNotFoundError(`material ${trigger.session.material_id}`);

    const input = buildAnalysisInput({
      trigger,
      history: await this.loadHistory(trigger),
      material: material ? { id: material.id, title: material.title, subject: material.subject, sequence: sequenceOf(material) } : { id: "", title: "", subject: "", sequence: [] },
      class_context: await repo.getClassContext(),
    });
    const writer = this.writerKey();
    const input_hash = analysisInputHash(input, writer);

    const existing = await repo.getAnalysisBySession(sessionId);
    if (existing?.status === "done" && existing.input_hash === input_hash && !options.force) {
      return { analysis: existing, cached: true, insights: [] };
    }

    const base = { session_id: sessionId, student_id: input.student_id, input_hash, attempts: (existing?.attempts ?? 0) + 1 };
    const startedAt = this.now();
    const running = await this.save(this.record({ ...base, status: "running", started_at: startedAt }));

    try {
      const findings = computeFindings(input);
      const template = templateWrite(input, findings);
      const rejections: Rejection[] = [];
      let llm: WriterOutput | null = null;
      if (this.deps.writer && findings.length > 0) {
        try {
          llm = WriterOutput.parse(await this.deps.writer.write(input, findings));
        } catch (err) {
          rejections.push({ concept_key: "*", reason: "llm_failed" });
          this.deps.log?.(`LLM writer failed for ${sessionId}; using the template`, err);
        }
      }
      const composition = composeInsights({ input, findings, template, llm });
      const persisted = await persistInsights({ repo, analysis_id: running.id, session_id: sessionId, input, composed: composition.insights });

      const trig = input.sessions.find((s) => s.session_id === sessionId)!;
      const done = await this.save(
        this.record({
          ...base,
          status: "done",
          started_at: startedAt,
          finished_at: this.now(),
          skip_reason: input.skip_reason,
          studying_lesson_id: input.studying_lesson_id,
          counters: trig.counters,
          findings,
          summary: composition.summary,
          rejections: [...rejections, ...composition.rejections],
          insight_ids: persisted.touched.map((i) => i.id),
        }),
      );
      for (const insight of persisted.created) this.deps.emit?.({ type: "insight_created", insight });
      return { analysis: done, cached: false, insights: persisted.touched };
    } catch (err) {
      this.deps.log?.(`analysis of ${sessionId} failed`, err);
      const failed = await this.save(
        this.record({ ...base, status: "failed", started_at: startedAt, finished_at: this.now(), error: err instanceof Error ? err.message : String(err) }),
      );
      return { analysis: failed, cached: false, insights: [] };
    }
  }

  /**
   * Marks the analysis `pending` and runs it in the background (the HTTP `202` path).
   * Returns the stored row immediately; poll `repo.getAnalysisBySession` for the result.
   */
  async start(sessionId: string, options: RunOptions = {}): Promise<Analysis> {
    const { repo, conversations } = this.deps;
    const bundle = await conversations.getSessionBundle(sessionId);
    if (!bundle) throw new AnalysisNotFoundError(`session ${sessionId}`);

    // A normal request while this session is already being handled just reports that work; a forced one queues behind it.
    const handling = this.gates.get(sessionId);
    if (handling && !options.force) return handling;

    let open!: (row: Analysis) => void;
    let fail!: (err: unknown) => void;
    const gate = new Promise<Analysis>((resolve, reject) => {
      open = resolve;
      fail = reject;
    });
    this.gates.set(sessionId, gate);

    // One unit per request, in the session's queue: decide + mark `pending`, then run, with nothing interleaving.
    const unit: Promise<void> = this.serial(sessionId, async () => {
      try {
        const existing = await repo.getAnalysisBySession(sessionId);
        open(
          existing && existing.status === "done" && !options.force
            ? existing
            : await this.save(this.record({ session_id: sessionId, student_id: bundle.session.student_id, status: "pending", attempts: existing?.attempts ?? 0 })),
        );
      } catch (err) {
        fail(err);
        return;
      }
      await this.execute(sessionId, options);
    })
      .catch((err) => this.deps.log?.(`background analysis of ${sessionId} crashed`, err))
      .finally(() => {
        this.inflight.delete(unit);
        if (this.gates.get(sessionId) === gate) this.gates.delete(sessionId);
      });
    this.inflight.add(unit);
    return gate;
  }

  /** Resolves when every background analysis started with `start` has finished. */
  async idle(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }
}
