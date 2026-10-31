import { describe, expect, it } from "vitest";
import { StreamMessage, type Chunk, type Retriever, type TurnRequest } from "@mento/contracts";
import { LlmError } from "./llm";
import { InMemoryTurnRepository, ScriptedLlm, stopEvent, toolEvent } from "./testing";
import { TurnEngine, SessionNotFoundError, type TurnEngineDeps } from "./turn-engine";
import { noopDraw, noopJudge, type DrawPipeline, type Judge, type TtsStarter } from "./hooks";

const prompts = { base: "BASE", subjects: { history: "HISTORY", generic: "GENERIC" } };
const passage: Chunk = { id: "c1", material_id: "m1", subject: "history", chapter: "O Império", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto." };
const retriever = (chunks: Chunk[] = []): Retriever => ({ searchChunks: async () => chunks, validateCitation: async () => false });

async function setup(rounds: Parameters<typeof ScriptedLlm.prototype.stream>[0] extends never ? never : ConstructorParameters<typeof ScriptedLlm>[0], overrides: Partial<TurnEngineDeps> = {}, llmOpts: ConstructorParameters<typeof ScriptedLlm>[1] = {}) {
  const repo = new InMemoryTurnRepository({ catalog: [{ material_id: "m1", title: "História de Roma", subject: "history", chapters: ["O Império"] }] });
  const llm = new ScriptedLlm(rounds, llmOpts);
  const engine = new TurnEngine({ llm, repo, retriever: retriever(), tts: null, draw: noopDraw, judge: noopJudge, prompts, models: { tutor: "tutor-model" }, bridgeAfterMs: 5_000, ...overrides });
  const { id } = await repo.createSession({ student_id: "stu_1", modality: "text" });
  return { repo, llm, engine, session: id };
}

const opening: TurnRequest = { modality: "text", appended: [] };
const say = (text: string): TurnRequest => ({ modality: "text", appended: [{ name: "user_message", kind: "chat", text }] });

async function run(engine: TurnEngine, session: string, req: TurnRequest, signal = new AbortController().signal) {
  const messages: StreamMessage[] = [];
  const result = await engine.run(session, req, (m) => messages.push(m), signal);
  await engine.idle();
  return { messages, result };
}
const types = (ms: StreamMessage[]) => ms.map((m) => m.type);
const actionNames = (ms: StreamMessage[]) => ms.flatMap((m) => (m.type === "action" ? [m.action.name] : []));

describe("TurnEngine: the script", () => {
  it("streams an opening turn: ordered actions with server ids, then script_done and turn_done with timing", async () => {
    const { engine, session, repo, llm } = await setup([[toolEvent("speak", { text: "Olá! O que vamos estudar?" }), toolEvent("write_text", { id: "title", column: "main", html: "<h1>Vamos começar</h1>" }), stopEvent()]]);
    const { messages, result } = await run(engine, session, opening);
    expect(result.turn_id).toBe("turn_1");
    expect(types(messages)).toEqual(["action", "action", "script_done", "turn_done"]);
    expect(messages.map((m) => (m.type === "action" ? [m.order, m.action.id] : null))).toEqual([[0, "act_1_0"], [1, "act_1_1"], null, null]);
    for (const m of messages) StreamMessage.parse(m);
    const done = messages.at(-1);
    expect(done).toMatchObject({ type: "turn_done", turn_id: "turn_1" });
    expect(done?.type === "turn_done" && done.timing?.first_action_ms).toBeGreaterThanOrEqual(0);

    const events = await repo.listEvents(session);
    expect(events.map((e) => e.type)).toEqual(["session_started", "tutor_action", "tutor_action", "turn_timing"]);
    expect(JSON.stringify(llm.calls[0]?.messages)).toContain("The conversation is starting");
    expect(llm.calls[0]?.model).toBe("tutor-model");
    expect(llm.calls[0]?.system[1]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("drops invalid blocks and forwards only valid actions", async () => {
    const { engine, session } = await setup([[
      toolEvent("highlight", { target_id: "ghost", color: "yellow" }),
      toolEvent("teleport", {}),
      toolEvent("speak", '{"text": "cortado'),
      toolEvent("speak", { text: "Isto passa." }),
      stopEvent(),
    ]]);
    const { messages } = await run(engine, session, opening);
    expect(actionNames(messages)).toEqual(["speak"]);
    expect(messages.some((m) => m.type === "error")).toBe(false);
  });

  it("records student input, hints, verifications, interruptions and starts the judge on an answer", async () => {
    const judged: unknown[] = [];
    const judge: Judge = { start: async (i) => void judged.push(i) };
    const { engine, session, repo } = await setup(
      [
        [toolEvent("ask_verification", { id: "q1", column: "main", concept: "Fim da República", question: "Por que mudou?", kind: "explain" }), stopEvent()],
        [toolEvent("speak", { text: "Pense no Senado.", purpose: "hint", hint_level: 1 }), stopEvent()],
      ],
      { judge },
    );
    const first = await run(engine, session, say("Quero estudar Roma"));
    expect(actionNames(first.messages)).toEqual(["ask_verification"]);
    const ask = first.messages[0];
    expect(ask?.type === "action" && ask.action.name === "ask_verification" && ask.action.args.verification_id).toBe("ver_1");

    await run(engine, session, {
      modality: "text",
      appended: [{ name: "verification_answer", verification_id: "ver_1", element_id: "q1", answer: "Não sei" }],
      interrupted: { turn_id: "turn_1", action_id: "act_1_0", spoken_chars: 20 },
    });
    const events = await repo.listEvents(session);
    const kinds = events.map((e) => e.type);
    for (const t of ["user_message", "verification_asked", "interrupted", "verification_answered", "hint_given"]) expect(kinds).toContain(t);
    expect(events.find((e) => e.type === "hint_given")?.payload).toMatchObject({ level: 1, verification_id: undefined });
    expect(judged).toEqual([{ session_id: session, student_id: "stu_1", verification_id: "ver_1", element_id: "q1", answer: "Não sei" }]);
  });

  it("restores the board from events after a restart", async () => {
    const { engine, session, repo, llm } = await setup([[toolEvent("write_text", { id: "title", column: "main", html: "<h1>Roma</h1>" }), stopEvent()]]);
    await run(engine, session, opening);
    const engine2 = new TurnEngine({ llm: new ScriptedLlm([[toolEvent("highlight", { target_id: "title", color: "yellow" }), stopEvent()]]), repo, retriever: retriever(), tts: null, draw: noopDraw, judge: noopJudge, prompts, models: { tutor: "m" } });
    const { messages, result } = await run(engine2, session, say("continue"));
    expect(actionNames(messages)).toEqual(["highlight"]);
    expect(result.turn_id).toBe("turn_2");
    expect(llm.calls).toHaveLength(1);
  });

  it("rejects an unknown session", async () => {
    const { engine } = await setup([[stopEvent()]]);
    await expect(engine.run("nope", opening, () => undefined, new AbortController().signal)).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

describe("TurnEngine: voice, drawing and search", () => {
  it("starts a TTS job for each speak in voice mode, sets the audio fields and sends the alignment before turn_done", async () => {
    const started: string[] = [];
    const tts: TtsStarter = {
      start: async ({ action_id, text }) => {
        started.push(`${action_id}:${text}`);
        return { words: [{ word: "Olá!", start_ms: 0, end_ms: 300 }], first_byte_ms: 120, audio_bytes: 100, cached: false };
      },
    };
    const { engine, session } = await setup([[toolEvent("speak", { text: "Olá!" }), stopEvent()]], { tts });
    const { messages } = await run(engine, session, { modality: "voice", appended: [] });
    expect(started).toEqual(["act_1_0:Olá!"]);
    const first = messages[0];
    expect(first?.type === "action" && first.action.name === "speak" && first.action.args.audio_url).toBe("/api/tts/act_1_0");
    // The alignment may arrive before or after script_done (it depends on how fast the TTS is), never after turn_done.
    expect(types(messages)[0]).toBe("action");
    expect(types(messages)).toContain("speech_alignment");
    expect(types(messages).indexOf("script_done")).toBeLessThan(types(messages).indexOf("turn_done"));
    expect(types(messages).at(-1)).toBe("turn_done");
    expect(messages.at(-1)).toMatchObject({ timing: { tts_first_byte_ms: 120 } });
  });

  it("starts the draw pipeline, delivers its late messages before turn_done and keeps the order increasing", async () => {
    const draw: DrawPipeline = { start: async (a) => [{ type: "action", order: 99, action: { id: "late", name: "draw_result", args: { element_id: a.args.id, url: "/api/gen/x.jpg" } } }] };
    const { engine, session } = await setup([[toolEvent("draw", { id: "colosseum", column: "visuals", prompt: "Coliseu", is_structured: false, max_dimensions: { w: 500, h: 400 } }), stopEvent()]], { draw });
    const { messages } = await run(engine, session, opening);
    expect(actionNames(messages)).toEqual(["draw", "draw_result"]);
    expect(types(messages).at(-1)).toBe("turn_done");
    expect(types(messages)).toContain("script_done");
    const orders = messages.flatMap((m) => (m.type === "action" ? [m.order] : []));
    expect(orders).toEqual([0, 1]); // the pipeline's own order (99) is replaced by the next number
  });

  it("answers a search_materials call with a second round, keeps real citations and drops fake ones", async () => {
    const { engine, session, llm } = await setup(
      [
        [toolEvent("speak", { text: "Vou conferir no livro." }, "toolu_a"), toolEvent("search_materials", { query: "Augusto" }, "toolu_b"), stopEvent("tool_use")],
        [
          toolEvent("speak", { text: "Achei!", sources: [{ material_id: "m1", page: 12, quote: "o Senado concedeu a Otávio o título de Augusto" }, { material_id: "m1", page: 99, quote: "inventada" }] }),
          stopEvent(),
        ],
      ],
      { retriever: retriever([passage]) },
    );
    const { messages } = await run(engine, session, say("Quem foi Augusto?"));
    expect(llm.calls).toHaveLength(2);
    const second = llm.calls[1]!.messages;
    expect(second).toHaveLength(3);
    expect(second[1]).toMatchObject({ role: "assistant" });
    const results = (second[2]!.content as { type: string; tool_use_id: string; content: string }[]);
    expect(results.map((r) => r.tool_use_id)).toEqual(["toolu_a", "toolu_b"]);
    expect(results[1]?.content).toContain("[m1 · p.12 · O Império]");
    const speaks = messages.flatMap((m) => (m.type === "action" && m.action.name === "speak" ? [m.action.args] : []));
    expect(speaks).toHaveLength(2);
    expect(speaks[1]?.sources).toEqual([{ material_id: "m1", page: 12, quote: "o Senado concedeu a Otávio o título de Augusto" }]);
    expect(types(messages).filter((t) => t === "script_done")).toHaveLength(1);
  });

  it("puts the passages found before the call into the prompt", async () => {
    const { engine, session, llm } = await setup([[stopEvent()]], { retriever: retriever([passage]) });
    await run(engine, session, say("Quem foi Augusto?"));
    expect(JSON.stringify(llm.calls[0]?.messages)).toContain("[m1 · p.12 · O Império]");
  });
});

describe("TurnEngine: failures", () => {
  it("retries once on a retryable error before any action, without telling the client", async () => {
    const { engine, session, llm } = await setup([[toolEvent("speak", { text: "Voltei." }), stopEvent()]], {}, { failFirst: new LlmError("overloaded", 529, true) });
    const { messages } = await run(engine, session, opening);
    expect(llm.calls).toHaveLength(2);
    expect(types(messages)).toEqual(["action", "script_done", "turn_done"]);
  });

  it("sends a recoverable error and no turn_done when the LLM fails for good", async () => {
    const { engine, session } = await setup([[stopEvent()]], {}, { failFirst: new LlmError("bad request", 400, false) });
    const { messages } = await run(engine, session, opening);
    expect(messages).toEqual([{ type: "error", code: "llm_error", message: "O tutor teve um problema. Tente de novo.", recoverable: true }]);
  });

  it("speaks a bridging line when the model is slow, then continues", async () => {
    const { engine, session } = await setup([[toolEvent("speak", { text: "Pronto." }), stopEvent()]], { bridgeAfterMs: 20 }, { delayMs: 120 });
    const { messages } = await run(engine, session, opening);
    const texts = messages.flatMap((m) => (m.type === "action" && m.action.name === "speak" ? [m.action.args.text] : []));
    expect(texts).toEqual(["Deixa eu pensar um instante…", "Pronto."]);
  });

  it("stops without script_done or turn_done when the client aborts, and cancels TTS jobs", async () => {
    const cancelled: string[] = [];
    const tts: TtsStarter = { start: async () => ({ words: [], first_byte_ms: 1, audio_bytes: 1, cached: false }), cancel: (id) => void cancelled.push(id) };
    const { engine, session } = await setup([[toolEvent("speak", { text: "Um." }), toolEvent("speak", { text: "Dois." }), toolEvent("speak", { text: "Três." }), stopEvent()]], { tts });
    const controller = new AbortController();
    const messages: StreamMessage[] = [];
    await engine.run(session, { modality: "voice", appended: [] }, (m) => { messages.push(m); controller.abort(); }, controller.signal);
    await engine.idle();
    expect(actionNames(messages)).toEqual(["speak"]);
    expect(types(messages)).not.toContain("script_done");
    expect(types(messages)).not.toContain("turn_done");
    expect(cancelled).toEqual(["act_1_0"]);
  });
});

describe("TurnEngine.prewarm", () => {
  it("asks the LLM to cache the static prefix", async () => {
    const { engine, session, llm } = await setup([[stopEvent()]]);
    await engine.prewarm(session);
    expect(llm.prewarmed).toBe(1);
  });
});
