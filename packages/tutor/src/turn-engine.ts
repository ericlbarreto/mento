import type { BoardEditRequest, Chunk, EventType, StreamMessage, TurnRequest, TurnTiming } from "@mento/contracts";
import type { Effort, LlmClient, LlmContentBlock, LlmMessage, ThinkingSetting } from "./llm";
import { LlmError } from "./llm";
import { commitAction, prepareAction } from "./action-pipeline";
import { noopDraw, noopJudge, type DrawPipeline, type Judge, type TtsStarter } from "./hooks";
import { buildSystem, buildUserMessage, formatPassages, historyFromEvents, repliesWithoutQuestion, type CatalogEntry, type SessionSubject } from "./prompt-builder";
import type { PromptSet } from "./prompts";
import type { TurnRepository } from "./repository";
import { retrievalQuery } from "./retrieval-step";
import type { ToolBlock } from "./tool-assembler";
import { SearchMaterialsArgs, modelTools } from "./tools";
import { OrderedQueue, applyStudentEdit, restoreRuntime, studentEditEvent, type Runtime, type StudentEditResult } from "./turn-runtime";
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
  models: { tutor: string; thinking?: ThinkingSetting; effort?: Effort };
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
  /** The subject's materials (undefined on a free whiteboard): every search is limited to them. */
  material_ids?: string[];
  pending: Promise<unknown>[];
  ttsActions: string[];
  /** Successful board actions of this reply (all rounds); the bridge line and `speak`s never count. */
  boardActions: number;
  firstBoardActionMs?: number;
  /** A `speak` that arrived while the board is still empty in this reply: sent later, in order (Plan C). */
  held?: { block: ToolBlock; result: { outcome: string; is_error: boolean } };
  fallback: boolean;
  /** The model's `speak`s sent in this reply (the bridge line never counts). */
  speaks: number;
  /** The last model `speak` sent: the fallback card is written from it when the reply has no board action. */
  lastSpeak?: ToolBlock;
  /** Name of the last action the model got onto the board or the voice (all rounds). */
  lastAction?: string;
  verified: boolean;
  /** `draw` images and written text blocks of this reply, for the image cap. */
  draws: number;
  textBlocks: number;
}

interface RoundResult {
  searches: ToolBlock[];
  /** Every tool block of the round with the outcome the model should be told. */
  results: { block: ToolBlock; outcome: string; is_error: boolean }[];
  stop_reason?: string;
}

/** Rounds per reply (search included): the model often stops after one or two tool calls to wait for their results. */
const MAX_ROUNDS = 4;
/** Extra rounds asked for a reply that was cut (no closing speak, nothing on the board). */
const MAX_CONTINUES = 1;
const NO_BOARD_TEXT = "Nothing is on the board yet in this reply: your next call is `write_text`. ";
const CONTINUE_TEXT =
  "Continue the same reply: explain what you put on the board (call circle_annotate right before the speak that says each key word), then close with a short speak. Do not add another picture, and do not ask a question unless you are checking the key concept.";

/** Board actions that count for "every reply writes or draws on the board" (pointing at an element counts). */
const BOARD_ACTIONS = new Set(["write_text", "write_timeline", "draw", "draw_diagram", "update_element", "circle_annotate", "highlight"]);
const TEXT_BLOCKS = new Set(["write_text", "write_timeline"]);
/** Images per reply: never more than the text blocks written so far (at least one), and never more than this. */
const MAX_DRAWS = 1;
const DRAW_REJECTED = "rejected: this reply already has its picture (at most one per reply, never more pictures than text). Do not draw; write the idea with write_text or point at the existing picture.";
const FALLBACK_MAX_CHARS = 120;

const isQuestion = (block: ToolBlock): boolean =>
  block.name === "speak" && (safeJson(block.raw_input) as { purpose?: string } | null)?.purpose === "question";

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The deterministic card written when a reply reached its closing speak with nothing on the board. */
function fallbackCard(line: string, id: string): ToolBlock {
  const text = line.replace(/\s+/g, " ").trim();
  const short = text.length > FALLBACK_MAX_CHARS ? `${text.slice(0, FALLBACK_MAX_CHARS - 1)}…` : text;
  return { id: "board_fallback", name: "write_text", raw_input: JSON.stringify({ id, column: "side", html: `<p><b>${escapeHtml(short)}</b></p>` }) };
}

/**
 * A reply that stopped for tool results is complete when it asked a verification, or when it has something on
 * the board, at least two speaks and ends on a speak (any purpose: a reply does not have to end with a question).
 */
function replyComplete(state: TurnState): boolean {
  return state.verified || (state.boardActions > 0 && state.speaks >= 2 && state.lastAction === "speak");
}

const BRIDGE_TEXT = "Deixa eu pensar um instante…";
const ERROR_TEXT = "O tutor teve um problema. Tente de novo.";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class TurnEngine {
  private readonly runtimes = new Map<string, Runtime>();
  /** Runtimes being restored from events, so a turn and a board edit arriving together share one. */
  private readonly loading = new Map<string, Promise<Runtime>>();
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
    const rt = this.runtimes.get(session_id);
    if (rt) return rt;
    let pending = this.loading.get(session_id);
    if (!pending) {
      pending = this.deps.repo.listEvents(session_id).then((events) => {
        const restored = restoreRuntime(events);
        this.runtimes.set(session_id, restored);
        return restored;
      });
      this.loading.set(session_id, pending);
      pending.finally(() => this.loading.delete(session_id)).catch(() => undefined);
    }
    return pending;
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

  private async catalogFor(rt: Runtime, subject: SessionSubject | null): Promise<CatalogEntry[]> {
    rt.catalog ??= await this.deps.repo.getCatalog(subject?.id);
    return rt.catalog;
  }

  /**
   * The student deleted or moved a board element (plan F, D79). Applied to the in-memory board at once (the next
   * round of a streaming turn already sees it) and stored through the session's ordered queue, so it lands between
   * the tutor actions in the order it happened. Works on ended sessions too. Resolves once the event is stored.
   */
  async applyStudentEdit(session_id: string, edit: BoardEditRequest): Promise<StudentEditResult> {
    const session = await this.deps.repo.getSession(session_id);
    if (!session) throw new SessionNotFoundError(session_id);
    const rt = await this.runtime(session_id);
    const result = applyStudentEdit(rt, edit);
    if (result !== "applied") return result;
    const event = studentEditEvent(edit);
    await new Promise<void>((resolve, reject) =>
      this.queueFor(session_id).enqueue(() =>
        this.deps.repo.appendEvent(session_id, event).then(
          () => resolve(),
          (err: unknown) => {
            reject(err);
            throw err;
          },
        ),
      ),
    );
    return result;
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
    const rt = await this.runtime(session_id);
    const [classContext, summary, catalog] = await Promise.all([repo.getClassContext(), repo.getLearnerSummary(session.student_id), this.catalogFor(rt, session.subject)]);
    const system = buildSystem({ prompts, classContext, summary, catalog, subject: session.subject });
    await llm.prewarm({ model: models.tutor, thinking: models.thinking, effort: models.effort, system, tools: modelTools(), messages: [{ role: "user", content: "." }] });
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
    // With a subject, only its books are searched (and listed); a free whiteboard searches everything.
    const catalog = await this.catalogFor(rt, session.subject);
    const material_ids = session.subject ? catalog.map((m) => m.material_id) : undefined;
    const [classContext, summary, events, passages] = await Promise.all([
      repo.getClassContext(),
      repo.getLearnerSummary(session.student_id),
      repo.listEvents(session_id),
      query ? retriever.searchChunks({ query, k: 6, material_ids }) : Promise.resolve([] as Chunk[]),
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
      session_id, student_id: session.student_id, modality: req.modality, turn_id, rt, emit, signal, persist, t0, material_ids,
      timing: { context_ready_ms: Math.round(this.now() - t0) },
      order: 0, actionSeq: 0, emitted: 0, passages: [...passages], pending: [], ttsActions: [],
      boardActions: 0, fallback: false, speaks: 0, verified: false, draws: 0, textBlocks: 0,
    };

    const system = buildSystem({ prompts, classContext, summary, catalog, subject: session.subject });
    const userText = buildUserMessage({
      modality: req.modality,
      history: historyFromEvents(events),
      boardSnapshot: rt.board.snapshot(),
      passages,
      appended: req.appended,
      interrupted: req.interrupted,
      repliesWithoutQuestion: repliesWithoutQuestion(events),
    });
    let messages: LlmMessage[] = [{ role: "user", content: userText }];

    try {
      let searched = false;
      let continues = 0;
      for (let round = 0; ; round++) {
        const result = await this.streamWithRetry(state, models.tutor, system, messages);
        if (signal.aborted) break;
        const search: boolean = result.searches.length > 0 && !searched;
        const unfinished = result.stop_reason === "tool_use" && result.results.length > 0 && !replyComplete(state) && continues < MAX_CONTINUES;
        if ((!search && !unfinished) || round === MAX_ROUNDS - 1) break;

        const found = search ? await this.runSearches(state, result.searches) : new Map<string, string>();
        searched ||= search;
        if (!search) continues += 1;
        const assistant: LlmContentBlock[] = result.results.map((r) => ({ type: "tool_use", id: r.block.id, name: r.block.name, input: safeJson(r.block.raw_input) }));
        const toolResults: LlmContentBlock[] = result.results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.block.id,
          content: r.block.name === "search_materials" ? (found.get(r.block.id) ?? "(no results)") : r.outcome,
          is_error: r.is_error || undefined,
        }));
        if (!search) toolResults.push({ type: "text", text: state.boardActions === 0 ? NO_BOARD_TEXT + CONTINUE_TEXT : CONTINUE_TEXT });
        messages = [...messages, { role: "assistant", content: assistant }, { role: "user", content: toolResults }];
      }
    } catch (err) {
      if (signal.aborted) return this.abort(state);
      this.log("turn failed", err);
      emit({ type: "error", code: "llm_error", message: ERROR_TEXT, recoverable: true });
      return { turn_id };
    }

    if (signal.aborted) return this.abort(state);
    // A reply that ended with nothing on the board still gets its card (a verification is a card already).
    if (state.boardActions === 0 && !state.verified && state.lastSpeak) await this.writeFallback(state, state.lastSpeak);
    if (signal.aborted) return this.abort(state);
    this.log("board actions", { turn_id, board_actions: state.boardActions, board_fallback: state.fallback, first_board_action_ms: state.firstBoardActionMs });

    state.timing.script_done_ms = Math.round(this.now() - t0);
    emit({ type: "script_done", turn_id });
    await Promise.race([Promise.allSettled(state.pending), sleep(this.deps.pendingTimeoutMs ?? 15_000)]);
    if (signal.aborted) return this.abort(state);

    emit({ type: "turn_done", turn_id, timing: state.timing });
    persist({ type: "turn_timing", payload: { turn_id, ...state.timing } });
    return { turn_id };
  }

  private abort(state: TurnState): { turn_id: string } {
    state.held = undefined;
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
    state.held = undefined; // a retried round starts over
    const bridge = setTimeout(() => {
      if (state.emitted === 0 && !state.held && !state.signal.aborted) {
        void this.handleBlock(state, { id: "bridge", name: "speak", raw_input: JSON.stringify({ text: BRIDGE_TEXT }) });
      }
    }, this.deps.bridgeAfterMs ?? 3000);

    try {
      for await (const ev of this.deps.llm.stream({ model, thinking: this.deps.models.thinking, effort: this.deps.models.effort, system, tools: modelTools(), messages, max_tokens: this.deps.maxTokens ?? 2048, signal: state.signal })) {
        if (state.signal.aborted) break;
        if (ev.type === "first_token") {
          state.timing.llm_first_token_ms ??= Math.round(this.now() - state.t0);
        } else if (ev.type === "stop") {
          result.stop_reason = ev.stop_reason;
        } else if (ev.type === "tool_block") {
          // The model kept going after a held question: send it now, in its place.
          if (state.held) await this.releaseHeld(state);
          if (state.signal.aborted) break;
          if (ev.block.name === "search_materials") {
            result.searches.push(ev.block);
            result.results.push({ block: ev.block, outcome: "", is_error: false });
          } else if (ev.block.name === "speak" && state.boardActions === 0 && (state.emitted > 0 || isQuestion(ev.block))) {
            // A speak with nothing on the board yet (not the opener, which goes out at once): hold it until we know
            // whether the model writes something, so the fallback card can come before the closing line.
            const entry = { block: ev.block, outcome: "ok", is_error: false };
            state.held = { block: ev.block, result: entry };
            result.results.push(entry);
          } else if (ev.block.name === "draw" && state.draws >= Math.min(MAX_DRAWS, Math.max(1, state.textBlocks))) {
            // Pictures keep pace with the text: the extra image is never sent, and the model is told to write instead.
            this.log("draw rejected", { turn_id: state.turn_id, draws: state.draws, text_blocks: state.textBlocks });
            result.results.push({ block: ev.block, outcome: DRAW_REJECTED, is_error: true });
          } else {
            const outcome = await this.handleBlock(state, ev.block);
            result.results.push({ block: ev.block, outcome: outcome ?? "ok", is_error: outcome !== null });
          }
        }
      }
    } finally {
      clearTimeout(bridge);
    }
    if (state.held && !state.signal.aborted) {
      // End of the round and still nothing on the board: write the held line as a card, then say it.
      if (state.boardActions === 0) await this.writeFallback(state, state.held.block);
      await this.releaseHeld(state);
    }
    if (state.signal.aborted) state.held = undefined;
    return result;
  }

  private async releaseHeld(state: TurnState): Promise<void> {
    const held = state.held;
    if (!held) return;
    state.held = undefined;
    const outcome = await this.handleBlock(state, held.block);
    held.result.outcome = outcome ?? "ok";
    held.result.is_error = outcome !== null;
  }

  private async writeFallback(state: TurnState, line: ToolBlock): Promise<void> {
    const text = String((safeJson(line.raw_input) as { text?: unknown } | null)?.text ?? "").trim();
    if (!text) return;
    let id = `board_fallback_${state.rt.turnNo}`;
    for (let n = 2; state.rt.board.has(id); n++) id = `board_fallback_${state.rt.turnNo}_${n}`;
    if ((await this.handleBlock(state, fallbackCard(text, id))) === null) {
      state.fallback = true;
      this.log("board_fallback", { turn_id: state.turn_id, element_id: id });
    }
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
    if (BOARD_ACTIONS.has(action.name)) {
      state.boardActions += 1;
      state.firstBoardActionMs ??= Math.round(this.now() - state.t0);
    }
    if (block.id !== "bridge") {
      state.lastAction = action.name;
      if (action.name === "speak") {
        state.speaks += 1;
        state.lastSpeak = block;
      }
      if (action.name === "ask_verification") state.verified = true;
      if (action.name === "draw") state.draws += 1;
      if (TEXT_BLOCKS.has(action.name)) state.textBlocks += 1;
    }

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
            // Late actions join the same ordering as the rest of the script, and are stored like the others
            // (so a session re-opened from the history shows the image).
            for (const m of messages) {
              if (m.type !== "action") {
                state.emit(m);
                continue;
              }
              // The student deleted the picture while it was being made: its result is dropped.
              const target = m.action.name === "draw_result" ? m.action.args.element_id : m.action.name === "update_element" ? m.action.args.id : null;
              if (target && state.rt.board.removedByStudent(target)) continue;
              const order = state.order++;
              state.emit({ ...m, order });
              state.persist({ type: "tutor_action", payload: { turn_id: state.turn_id, action_id: m.action.id, order, name: m.action.name, args: m.action.args } });
            }
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
      const chunks = await this.deps.retriever.searchChunks({
        query: args.data.query,
        k: args.data.k ?? 6,
        material_id: args.data.material_id,
        material_ids: state.material_ids,
        subject: args.data.subject,
      });
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
