import type { Chunk, EventType, StreamMessage, TurnRequest, TurnTiming } from "@mento/contracts";
import type { LlmClient, LlmContentBlock, LlmMessage } from "./llm";
import { LlmError } from "./llm";
import { commitAction, prepareAction } from "./action-pipeline";
import { noopDraw, noopJudge, type DrawPipeline, type Judge, type TtsStarter } from "./hooks";
import { buildSystem, buildUserMessage, formatPassages, historyFromEvents } from "./prompt-builder";
import type { PromptSet } from "./prompts";
import type { TurnRepository } from "./repository";
import { retrievalQuery } from "./retrieval-step";
import type { ToolBlock } from "./tool-assembler";
import { SearchMaterialsArgs, modelTools } from "./tools";
import { OrderedQueue, restoreRuntime, type Runtime } from "./turn-runtime";
import type { Retriever } from "@mento/contracts";

export class SessionNotFoundError extends Error {
  constructor(session_id: string) {
    super(`session not found: ${session_id}`);
    this.name = "SessionNotFoundError";
  }
}

export interface TurnEngineDeps {
  llm: LlmClient;
  repo: TurnRepository;
  retriever: Retriever;
  tts: TtsStarter | null;
  draw?: DrawPipeline;
  judge?: Judge;
  prompts: PromptSet;
  models: { tutor: string };
  /** Speak a bridging line when no action was emitted after this many ms. Default 3000. */
  bridgeAfterMs?: number;
  maxTokens?: number;
  /** Max ms to wait for late work (audio alignment, images) before turn_done. Default 15000. */
  pendingTimeoutMs?: number;
  log?: (message: string, extra?: unknown) => void;
}

interface TurnState {
  session_id: string;
  student_id: string;
  modality: "text" | "voice";
  turn_id: string;
  rt: Runtime;
  emit: (m: StreamMessage) => void;
  signal: AbortSignal;
  persist: (e: { type: EventType; payload: unknown }) => void;
  t0: number;
  timing: TurnTiming;
  order: number;
  actionSeq: number;
  emitted: number;
  passages: Chunk[];
  pending: Promise<unknown>[];
  ttsActions: string[];
}

interface RoundResult {
  searches: ToolBlock[];
  /** Every tool block of the round with the outcome the model should be told. */
  results: { block: ToolBlock; outcome: string; is_error: boolean }[];
}

const BRIDGE_TEXT = "Deixa eu pensar um instante…";
const ERROR_TEXT = "O tutor teve um problema. Tente de novo.";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class TurnEngine {
  private readonly runtimes = new Map<string, Runtime>();
  private readonly queues = new Map<string, OrderedQueue>();
  private readonly background = new Set<Promise<unknown>>();

  constructor(private readonly deps: TurnEngineDeps) {}

  private log(message: string, extra?: unknown): void {
    this.deps.log?.(message, extra);
  }

  private now(): number {
    return performance.now();
  }

  private queueFor(session_id: string): OrderedQueue {
    let q = this.queues.get(session_id);
    if (!q) {
      q = new OrderedQueue((err) => this.log("event persistence failed", err));
      this.queues.set(session_id, q);
    }
    return q;
  }

  private async runtime(session_id: string): Promise<Runtime> {
    let rt = this.runtimes.get(session_id);
    if (!rt) {
      rt = restoreRuntime(await this.deps.repo.listEvents(session_id));
      this.runtimes.set(session_id, rt);
    }
    return rt;
  }

  private track<T>(p: Promise<T>): void {
    const tracked = p.catch((err) => this.log("background task failed", err)).finally(() => this.background.delete(tracked));
    this.background.add(tracked);
  }

  /** Wait for background work (judge, persistence). Used by tests and graceful shutdown. */
  async idle(): Promise<void> {
    await Promise.all([...this.background]);
    await Promise.all([...this.queues.values()].map((q) => q.flush()));
  }

  forget(session_id: string): void {
    this.runtimes.delete(session_id);
    this.queues.delete(session_id);
  }

  /** Write the static prefix (tools + system) into the LLM prompt cache at session start. */
  async prewarm(session_id: string): Promise<void> {
    const { repo, llm, prompts, models } = this.deps;
    const session = await repo.getSession(session_id);
    if (!session || !llm.prewarm) return;
    const [classContext, summary, catalog] = await Promise.all([repo.getClassContext(), repo.getLearnerSummary(session.student_id), repo.getCatalog()]);
    await llm.prewarm({ model: models.tutor, system: buildSystem({ prompts, classContext, summary, catalog }), tools: modelTools(), messages: [{ role: "user", content: "." }] });
  }

  async run(session_id: string, req: TurnRequest, emit: (m: StreamMessage) => void, signal: AbortSignal): Promise<{ turn_id: string }> {
    const { repo, retriever, prompts, models } = this.deps;
    const t0 = this.now();
    const session = await repo.getSession(session_id);
    if (!session) throw new SessionNotFoundError(session_id);
    const rt = await this.runtime(session_id);
    rt.turnNo += 1;
    const turn_id = `turn_${rt.turnNo}`;
    const queue = this.queueFor(session_id);
    const persist = (e: { type: EventType; payload: unknown }) => queue.enqueue(() => repo.appendEvent(session_id, e));

    const query = retrievalQuery(req.appended, rt.lastTopic);
    const [classContext, summary, catalog, events, passages] = await Promise.all([
      repo.getClassContext(),
      repo.getLearnerSummary(session.student_id),
      repo.getCatalog(),
      repo.listEvents(session_id),
      query ? retriever.searchChunks({ query, k: 6 }) : Promise.resolve([] as Chunk[]),
    ]);

    // Record what the student did this turn (after reading the history, so it is not counted twice).
    if (req.interrupted) persist({ type: "interrupted", payload: { turn_id: req.interrupted.turn_id, action_id: req.interrupted.action_id } });
    for (const a of req.appended) {
      if (a.name === "user_message") {
        persist({ type: "user_message", payload: { kind: a.kind, text: a.text, selected: a.selected, stt: a.stt } });
      } else {
        persist({ type: "verification_answered", payload: { verification_id: a.verification_id, element_id: a.element_id, answer: a.answer } });
        if (rt.openVerification?.verification_id === a.verification_id) rt.openVerification = undefined;
        const judge = this.deps.judge ?? noopJudge;
        this.track(queue.flush().then(() => judge.start({ session_id, student_id: session.student_id, verification_id: a.verification_id, element_id: a.element_id, answer: a.answer })));
      }
    }

    const state: TurnState = {
      session_id, student_id: session.student_id, modality: req.modality, turn_id, rt, emit, signal, persist, t0,
      timing: { context_ready_ms: Math.round(this.now() - t0) },
      order: 0, actionSeq: 0, emitted: 0, passages: [...passages], pending: [], ttsActions: [],
    };

    const system = buildSystem({ prompts, classContext, summary, catalog });
    const userText = buildUserMessage({
      modality: req.modality,
      history: historyFromEvents(events),
      boardSnapshot: rt.board.snapshot(),
      passages,
      appended: req.appended,
      interrupted: req.interrupted,
    });
    let messages: LlmMessage[] = [{ role: "user", content: userText }];

    try {
      for (let round = 0; round < 2; round++) {
        const result = await this.streamWithRetry(state, models.tutor, system, messages);
        if (signal.aborted) break;
        if (result.searches.length === 0 || round === 1) break;

        const found = await this.runSearches(state, result.searches);
        const assistant: LlmContentBlock[] = result.results.map((r) => ({ type: "tool_use", id: r.block.id, name: r.block.name, input: safeJson(r.block.raw_input) }));
        const toolResults: LlmContentBlock[] = result.results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.block.id,
          content: r.block.name === "search_materials" ? (found.get(r.block.id) ?? "(no results)") : r.outcome,
          is_error: r.is_error || undefined,
        }));
        messages = [...messages, { role: "assistant", content: assistant }, { role: "user", content: toolResults }];
      }
    } catch (err) {
      if (signal.aborted) return this.abort(state);
      this.log("turn failed", err);
      emit({ type: "error", code: "llm_error", message: ERROR_TEXT, recoverable: true });
      return { turn_id };
    }

    if (signal.aborted) return this.abort(state);

    state.timing.script_done_ms = Math.round(this.now() - t0);
    emit({ type: "script_done", turn_id });
    await Promise.race([Promise.allSettled(state.pending), sleep(this.deps.pendingTimeoutMs ?? 15_000)]);
    if (signal.aborted) return this.abort(state);

    emit({ type: "turn_done", turn_id, timing: state.timing });
    persist({ type: "turn_timing", payload: { turn_id, ...state.timing } });
    return { turn_id };
  }

  private abort(state: TurnState): { turn_id: string } {
    for (const id of state.ttsActions) this.deps.tts?.cancel?.(id);
    return { turn_id: state.turn_id };
  }

  private async streamWithRetry(state: TurnState, model: string, system: ReturnType<typeof buildSystem>, messages: LlmMessage[]): Promise<RoundResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.consume(state, model, system, messages);
      } catch (err) {
        if (state.signal.aborted) return { searches: [], results: [] };
        const retryable = err instanceof LlmError && err.retryable;
        if (retryable && attempt === 0 && state.emitted === 0) {
          this.log("retrying the LLM call", err);
          await sleep(300);
          continue;
        }
        throw err;
      }
    }
  }

  private async consume(state: TurnState, model: string, system: ReturnType<typeof buildSystem>, messages: LlmMessage[]): Promise<RoundResult> {
    const result: RoundResult = { searches: [], results: [] };
    const bridge = setTimeout(() => {
      if (state.emitted === 0 && !state.signal.aborted) {
        void this.handleBlock(state, { id: "bridge", name: "speak", raw_input: JSON.stringify({ text: BRIDGE_TEXT }) });
      }
    }, this.deps.bridgeAfterMs ?? 3000);

    try {
      for await (const ev of this.deps.llm.stream({ model, system, tools: modelTools(), messages, max_tokens: this.deps.maxTokens ?? 2048, signal: state.signal })) {
        if (state.signal.aborted) break;
        if (ev.type === "first_token") {
          state.timing.llm_first_token_ms ??= Math.round(this.now() - state.t0);
        } else if (ev.type === "tool_block") {
          if (ev.block.name === "search_materials") {
            result.searches.push(ev.block);
            result.results.push({ block: ev.block, outcome: "", is_error: false });
          } else {
            const outcome = await this.handleBlock(state, ev.block);
            result.results.push({ block: ev.block, outcome: outcome ?? "ok", is_error: outcome !== null });
          }
        }
      }
    } finally {
      clearTimeout(bridge);
    }
    return result;
  }

  /** Validate, send and record one tool call. Returns null on success or the reason it was dropped. */
  private async handleBlock(state: TurnState, block: ToolBlock): Promise<string | null> {
    const { rt } = state;
    const prepared = await prepareAction(block, {
      id: `act_${rt.turnNo}_${state.actionSeq}`,
      verification_id: `ver_${rt.verSeq + 1}`,
      board: rt.board,
      passages: state.passages,
      retriever: this.deps.retriever,
    });
    if (prepared.kind === "dropped") {
      this.log("dropped a tool call", { name: block.name, reason: prepared.reason });
      return `dropped: ${prepared.reason}`;
    }
    state.actionSeq += 1;
    let action = prepared.action;

    if (action.name === "speak" && state.modality === "voice" && this.deps.tts) {
      const actionId = action.id;
      action = { ...action, args: { ...action.args, audio_url: `/api/tts/${actionId}`, audio_format: "pcm_s16le_24000" } };
      state.ttsActions.push(actionId);
      state.pending.push(
        this.deps.tts
          .start({ action_id: actionId, text: action.args.text })
          .then((r) => {
            if (state.signal.aborted) return;
            if (r.first_byte_ms !== null) state.timing.tts_first_byte_ms = Math.min(state.timing.tts_first_byte_ms ?? Infinity, r.first_byte_ms);
            if (r.words.length) state.emit({ type: "speech_alignment", action_id: actionId, words: r.words });
          })
          .catch((err) => this.log("tts failed", err)),
      );
    }

    commitAction(action, state.order++, {
      turn_id: state.turn_id,
      board: rt.board,
      openVerification: rt.openVerification,
      persist: state.persist,
      emit: state.emit,
    });
    if (state.emitted === 0) state.timing.first_action_ms = Math.round(this.now() - state.t0);
    state.emitted += 1;

    if (action.name === "ask_verification") {
      rt.verSeq += 1;
      rt.openVerification = { verification_id: action.args.verification_id, concept_key: action.args.concept_key };
    }
    if (action.name === "write_text") rt.lastTopic = (rt.board.get(action.args.id)?.text ?? "").slice(0, 80);

    if (action.name === "draw") {
      const draw = this.deps.draw ?? noopDraw;
      state.pending.push(
        draw
          .start(action, { session_id: state.session_id, signal: state.signal })
          .then((messages) => {
            if (state.signal.aborted) return;
            if (messages.length) state.timing.image_ready_ms = Math.round(this.now() - state.t0);
            // Late actions join the same ordering as the rest of the script.
            for (const m of messages) state.emit(m.type === "action" ? { ...m, order: state.order++ } : m);
          })
          .catch((err) => this.log("draw failed", err)),
      );
    }
    return null;
  }

  /** Run the model's search_materials calls and return the tool_result text by tool_use id. */
  private async runSearches(state: TurnState, searches: ToolBlock[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const block of searches) {
      const args = SearchMaterialsArgs.safeParse(safeJson(block.raw_input));
      if (!args.success) {
        out.set(block.id, "invalid arguments for search_materials");
        continue;
      }
      const chunks = await this.deps.retriever.searchChunks({ query: args.data.query, k: args.data.k ?? 6, material_id: args.data.material_id, subject: args.data.subject });
      state.passages.push(...chunks);
      out.set(block.id, formatPassages(chunks));
    }
    return out;
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
