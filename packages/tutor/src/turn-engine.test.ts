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
    // only the valid speak passes (a spoken-only reply gets no card, D80)
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
    const { engine, session, repo } = await setup([[toolEvent("draw", { id: "colosseum", column: "visuals", prompt: "Coliseu", is_structured: false, max_dimensions: { w: 500, h: 400 } }), stopEvent()]], { draw });
    const { messages } = await run(engine, session, opening);
    expect(actionNames(messages)).toEqual(["draw", "draw_result"]);
    expect(types(messages).at(-1)).toBe("turn_done");
    expect(types(messages)).toContain("script_done");
    const orders = messages.flatMap((m) => (m.type === "action" ? [m.order] : []));
    expect(orders).toEqual([0, 1]); // the pipeline's own order (99) is replaced by the next number
    // late actions are stored too, so a session re-opened from the history shows the image
    const stored = (await repo.listEvents(session)).filter((e) => e.type === "tutor_action").map((e) => (e.payload as { name: string; order: number }));
    expect(stored.map((p) => [p.name, p.order])).toEqual([["draw", 0], ["draw_result", 1]]);
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

describe("TurnEngine: subject of the session", () => {
  const catalog = [
    { material_id: "m1", title: "História de Roma", subject: "history", subject_id: "subj_hist", chapters: ["O Império"] },
    { material_id: "m9", title: "Álgebra", subject: "math", subject_id: "subj_math", chapters: [] },
  ];
  function spyRetriever() {
    const queries: unknown[] = [];
    const retriever: Retriever = { searchChunks: async (q) => (queries.push(q), [passage]), validateCitation: async () => false };
    return { retriever, queries };
  }

  it("searches only the subject's materials, before the call and in the search round, and names the subject in the prompt", async () => {
    const { retriever, queries } = spyRetriever();
    const repo = new InMemoryTurnRepository({ catalog });
    const llm = new ScriptedLlm([
      [toolEvent("search_materials", { query: "Augusto", material_id: "m9" }, "toolu_s"), stopEvent("tool_use")],
      [toolEvent("speak", { text: "Achei." }), stopEvent()],
    ]);
    const engine = new TurnEngine({ llm, repo, retriever, tts: null, prompts, models: { tutor: "m" } });
    const { id } = await repo.createSession({ student_id: "stu_1", modality: "text", subject: { id: "subj_hist", name: "História", key: "history" } });
    await run(engine, id, say("Quem foi Augusto?"));
    expect(queries).toEqual([
      { query: "Quem foi Augusto?", k: 6, material_ids: ["m1"] },
      { query: "Augusto", k: 6, material_id: "m9", material_ids: ["m1"], subject: undefined },
    ]);
    const system = llm.calls[0]!.system;
    expect(system[0]!.text).toContain("História (history)");
    expect(system[1]!.text).toContain("m1 | História de Roma");
    expect(system[1]!.text).not.toContain("Álgebra");
  });

  it("searches every material on a free whiteboard (no subject)", async () => {
    const { retriever, queries } = spyRetriever();
    const repo = new InMemoryTurnRepository({ catalog });
    const engine = new TurnEngine({ llm: new ScriptedLlm([[stopEvent()]]), repo, retriever, tts: null, prompts, models: { tutor: "m" } });
    const { id } = await repo.createSession({ student_id: "stu_1", modality: "text", subject: null });
    await run(engine, id, say("Quem foi Augusto?"));
    expect(queries).toEqual([{ query: "Quem foi Augusto?", k: 6, material_ids: undefined }]);
    const events = await repo.listEvents(id);
    expect(events[0]).toMatchObject({ type: "session_started", payload: { subject_id: null } });
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

describe("TurnEngine: continuing the reply", () => {
  const speakEv = (text: string, purpose?: string) => toolEvent("speak", { text, ...(purpose ? { purpose } : {}) });
  const writeEv = (id: string) => toolEvent("write_text", { id, column: "main", html: "<p>x</p>" });

  it("asks the model to continue when it stopped for tool results right after a board action", async () => {
    const { engine, session, llm } = await setup([
      [speakEv("Júlio César foi um general."), writeEv("cesar"), stopEvent("tool_use")],
      [speakEv("Ele conquistou a Gália."), speakEv("Por que o Senado tinha medo dele?", "question"), stopEvent("tool_use")],
      [speakEv("nunca"), stopEvent()],
    ]);
    const { messages } = await run(engine, session, say("Quem foi Júlio César?"));
    expect(llm.calls).toHaveLength(2);
    const second = llm.calls[1]!.messages;
    expect(second[1]).toMatchObject({ role: "assistant" });
    expect((second[2]!.content as { type: string }[]).map((b) => b.type)).toEqual(["tool_result", "tool_result", "text"]);
    const spoken = messages.flatMap((m) => (m.type === "action" && m.action.name === "speak" ? [m.action.args.text] : []));
    expect(spoken).toEqual(["Júlio César foi um general.", "Ele conquistou a Gália.", "Por que o Senado tinha medo dele?"]);
    expect(types(messages).filter((x) => x === "script_done")).toHaveLength(1);
  });

  it("stops after an ask_verification, after end_turn, and after at most one extra round", async () => {
    const verify = await setup([
      [speakEv("Vamos ver."), toolEvent("ask_verification", { id: "q1", column: "main", concept: "César", question: "Explique com suas palavras.", kind: "explain" }), stopEvent("tool_use")],
      [speakEv("nunca"), stopEvent()],
    ]);
    await run(verify.engine, verify.session, say("Quem foi César?"));
    expect(verify.llm.calls).toHaveLength(1);

    const ended = await setup([[speakEv("Oi"), stopEvent("end_turn")], [speakEv("nunca"), stopEvent()]]);
    await run(ended.engine, ended.session, opening);
    expect(ended.llm.calls).toHaveLength(1);

    const endless = await setup([[writeEv("passo"), speakEv("mais um passo"), writeEv("outro"), stopEvent("tool_use")]]);
    await run(endless.engine, endless.session, opening);
    expect(endless.llm.calls).toHaveLength(2);
  });

  it("completes a reply that closes with a statement: no question needed", async () => {
    const { engine, session, llm } = await setup([
      [speakEv("Júlio César foi um general."), writeEv("cesar"), speakEv("Ele conquistou a Gália."), speakEv("Se ficar alguma dúvida, é só falar.", "explain"), stopEvent("tool_use")],
      [speakEv("nunca"), stopEvent()],
    ]);
    const { messages } = await run(engine, session, say("Quem foi Júlio César?"));
    expect(llm.calls).toHaveLength(1);
    expect(actionNames(messages)).toEqual(["speak", "write_text", "speak", "speak"]);
  });

  it("continues a cut reply (it stopped on a board action) once, and never asks for a question", async () => {
    const { engine, session, llm } = await setup([
      [speakEv("Olha o quadro."), writeEv("cesar"), stopEvent("tool_use")],
      [speakEv("César foi um general."), stopEvent()],
    ]);
    const { messages } = await run(engine, session, say("Quem foi Júlio César?"));
    expect(llm.calls).toHaveLength(2);
    expect(actionNames(messages)).toEqual(["speak", "write_text", "speak"]);
    const nudge = (llm.calls[1]!.messages[2]!.content as { type: string; text?: string }[]).find((b) => b.type === "text");
    expect(nudge?.text).toMatch(/close with a short speak/);
    expect(nudge?.text).not.toMatch(/end with one question/);
  });

  it("continues a reply that stopped before any speak", async () => {
    const { engine, session, llm } = await setup([[stopEvent("tool_use")], [speakEv("Pronto."), stopEvent()]]);
    const dropped = await setup([[toolEvent("highlight", { target_id: "nao_existe", color: "yellow" }), stopEvent("tool_use")], [speakEv("Pronto."), stopEvent()]]);
    await run(engine, session, say("oi"));
    expect(llm.calls).toHaveLength(1); // nothing to continue from: no tool results
    await run(dropped.engine, dropped.session, say("oi"));
    expect(dropped.llm.calls).toHaveLength(2);
  });
});

describe("TurnEngine: pictures keep pace with the text", () => {
  const speakEv = (text: string) => toolEvent("speak", { text });
  const writeEv = (id: string) => toolEvent("write_text", { id, column: "main", html: "<p>Roma</p>" });
  const drawEv = (id: string, tool_use_id?: string) => toolEvent("draw", { id, column: "visuals", prompt: "Coliseu", is_structured: false, max_dimensions: { w: 500, h: 400 } }, tool_use_id);
  const diagram = { id: "reta", column: "visuals", title: "Reta", frame: "wide", shapes: [{ id: "chao", kind: "line", from: [10, 70], to: [150, 70] }] };

  it("sends at most one draw per reply, even after several text blocks, and never a placeholder for the extra one", async () => {
    const logs: string[] = [];
    const { engine, session } = await setup(
      [[speakEv("Olha."), drawEv("coliseu"), writeEv("a"), writeEv("b"), drawEv("forum"), speakEv("Esse é o Coliseu."), speakEv("Fica à vontade."), stopEvent()]],
      { log: (m) => void logs.push(m) },
    );
    const { messages } = await run(engine, session, say("Roma"));
    expect(actionNames(messages)).toEqual(["speak", "draw", "write_text", "write_text", "speak", "speak"]);
    expect(logs).toContain("draw rejected");
  });

  it("counts draws over the whole reply and tells the model to write instead", async () => {
    const { engine, session, llm } = await setup([
      [speakEv("Olha."), writeEv("a"), drawEv("coliseu"), stopEvent("tool_use")],
      [drawEv("forum", "toolu_extra"), speakEv("Esse é o Coliseu."), speakEv("Pronto."), stopEvent()],
    ]);
    const { messages } = await run(engine, session, say("Roma"));
    expect(llm.calls).toHaveLength(2);
    expect(actionNames(messages).filter((n) => n === "draw")).toHaveLength(1);

    const third = await setup([
      [speakEv("Olha."), drawEv("coliseu"), drawEv("forum", "toolu_x"), stopEvent("tool_use")],
      [writeEv("a"), speakEv("Pronto."), stopEvent()],
    ]);
    await run(third.engine, third.session, say("Roma"));
    const results = third.llm.calls[1]!.messages[2]!.content as { type: string; tool_use_id?: string; content?: string; is_error?: boolean }[];
    expect(results.find((r) => r.tool_use_id === "toolu_x")).toMatchObject({ is_error: true, content: expect.stringMatching(/write_text/) });
  });

  it("does not count draw_diagram as a picture", async () => {
    const { engine, session } = await setup([[speakEv("Olha."), drawEv("coliseu"), toolEvent("draw_diagram", diagram), speakEv("Aqui."), speakEv("Pronto."), stopEvent()]]);
    const { messages } = await run(engine, session, say("Roma"));
    expect(actionNames(messages)).toEqual(["speak", "draw", "draw_diagram", "speak", "speak"]);
  });
});

describe("TurnEngine: the board only when it continues the lesson (D80)", () => {
  const speakEv = (text: string, purpose?: string) => toolEvent("speak", { text, ...(purpose ? { purpose } : {}) });
  const writeEv = (id: string) => toolEvent("write_text", { id, column: "main", html: "<p>Roma</p>" });
  const actions = (ms: StreamMessage[]) => ms.flatMap((m) => (m.type === "action" ? [m.action] : []));
  const spoken = (ms: StreamMessage[]) => actions(ms).flatMap((a) => (a.name === "speak" ? [a.args.text] : []));

  it("completes a spoken-only reply with no card and no extra round", async () => {
    const logs: { m: string; x?: unknown }[] = [];
    const { engine, session, llm, repo } = await setup(
      [[speakEv("Eu não tenho nome de gente, sou o Mento."), speakEv("Se quiser, eu anoto isso no quadro.", "explain"), stopEvent("tool_use")], [writeEv("nunca"), stopEvent()]],
      { log: (m, x) => void logs.push({ m, x }) },
    );
    const { messages } = await run(engine, session, say("Qual é o seu nome?"));
    expect(llm.calls).toHaveLength(1);
    expect(actionNames(messages)).toEqual(["speak", "speak"]);
    expect(messages.flatMap((m) => (m.type === "action" ? [m.order] : []))).toEqual([0, 1]);
    expect(types(messages)).toContain("turn_done");
    expect(logs.find((l) => l.m === "board actions")?.x).toMatchObject({ board_actions: 0 });
    const stored = (await repo.listEvents(session)).filter((e) => e.type === "tutor_action").map((e) => (e.payload as { name: string }).name);
    expect(stored).toEqual(["speak", "speak"]);
  });

  it("sends a question with nothing on the board at once, in order", async () => {
    const { engine, session, llm } = await setup([[speakEv("Claro!"), speakEv("Qual é a sua dúvida?", "question"), stopEvent()]]);
    const { messages } = await run(engine, session, say("Posso perguntar uma coisa?"));
    expect(llm.calls).toHaveLength(1);
    expect(spoken(messages)).toEqual(["Claro!", "Qual é a sua dúvida?"]);
    expect(actions(messages).some((a) => a.name === "write_text")).toBe(false);
  });

  it("writes on the board when the model does, and pointing at an element is fine", async () => {
    const pointed = await setup([
      [writeEv("roma"), speakEv("Primeira."), stopEvent()],
      [toolEvent("circle_annotate", { target_id: "roma", text_to_match: "Roma", color: "red" }), speakEv("Isso aqui."), stopEvent()],
    ]);
    await run(pointed.engine, pointed.session, say("Roma"));
    const circled = await run(pointed.engine, pointed.session, say("o que é isso?"));
    expect(actionNames(circled.messages)).toEqual(["circle_annotate", "speak"]);
  });

  it("leaves the ask_verification path alone and never counts the bridge line as the closing speak", async () => {
    const verify = await setup([[speakEv("Vamos ver."), toolEvent("ask_verification", { id: "q1", column: "main", concept: "César", question: "Explique.", kind: "explain" }), stopEvent()]]);
    const v = await run(verify.engine, verify.session, say("César"));
    expect(actionNames(v.messages)).toEqual(["speak", "ask_verification"]);

    const bridged = await setup([[writeEv("roma"), stopEvent("tool_use")], [speakEv("Pronto."), stopEvent()]], { bridgeAfterMs: 20 }, { delayMs: 120 });
    const b = await run(bridged.engine, bridged.session, say("oi"));
    expect(bridged.llm.calls).toHaveLength(2);
    expect(spoken(b.messages)).toEqual(["Deixa eu pensar um instante…", "Pronto."]);
  });
});

describe("TurnEngine: model settings", () => {
  it("sends the same thinking and effort settings on every call and on the pre-warm (prompt cache)", async () => {
    const { engine, session, llm } = await setup([[toolEvent("speak", { text: "Oi" }), stopEvent()]], { models: { tutor: "claude-haiku-5-5", thinking: { type: "disabled" }, effort: "medium" } });
    await engine.prewarm(session);
    await run(engine, session, opening);
    expect(llm.calls[0]).toMatchObject({ model: "claude-haiku-5-5", thinking: { type: "disabled" }, effort: "medium" });
    expect(llm.prewarmRequests[0]).toMatchObject({ thinking: { type: "disabled" }, effort: "medium" });
  });
});

describe("TurnEngine.prewarm", () => {
  it("asks the LLM to cache the static prefix", async () => {
    const { engine, session, llm } = await setup([[stopEvent()]]);
    await engine.prewarm(session);
    expect(llm.prewarmed).toBe(1);
  });
});

describe("TurnEngine: student board edits (plan F)", () => {
  const write = (id: string, column = "main") => toolEvent("write_text", { id, column, html: `<p>${id}</p>` });
  const boardOf = (call: { messages: unknown[] } | undefined) => /## Board\n([\s\S]*?)\n\n## /.exec(String((call?.messages[0] as { content: string }).content))?.[1];

  it("stores an edit, dedupes it, and the next turn's board excludes the deleted id and lists the student's order", async () => {
    const { engine, session, repo, llm } = await setup([
      [write("a"), write("b"), write("c"), toolEvent("speak", { text: "Pronto." }), stopEvent()],
      [toolEvent("highlight", { target_id: "a", color: "yellow" }), write("a"), write("d"), toolEvent("speak", { text: "Ok." }), stopEvent()],
    ]);
    await run(engine, session, opening);
    expect(await engine.applyStudentEdit(session, { op: "remove", edit_id: "e1", element_id: "a" })).toBe("applied");
    expect(await engine.applyStudentEdit(session, { op: "remove", edit_id: "e1", element_id: "a" })).toBe("already_applied");
    expect(await engine.applyStudentEdit(session, { op: "remove", edit_id: "e2", element_id: "a" })).toBe("already_removed");
    expect(await engine.applyStudentEdit(session, { op: "move", edit_id: "e3", element_id: "c", column: "main", after_id: null })).toBe("applied");
    expect(await engine.applyStudentEdit(session, { op: "move", edit_id: "e4", element_id: "ghost", column: "main", after_id: null })).toBe("element_not_found");

    const stored = (await repo.listEvents(session)).filter((e) => e.type.startsWith("board_element"));
    expect(stored.map((e) => [e.type, e.payload])).toEqual([
      ["board_element_removed", { element_id: "a", edit_id: "e1" }],
      ["board_element_moved", { element_id: "c", column: "main", after_id: null, edit_id: "e3" }],
    ]);

    const { messages } = await run(engine, session, say("continue"));
    expect(boardOf(llm.calls[1])).toBe("c | text | main | c\nb | text | main | b\nRemoved by the student: a (text)");
    // the highlight and the re-created "a" are dropped; "d" goes to the end of the column
    expect(actionNames(messages)).toEqual(["write_text", "speak"]);
    const written = messages.flatMap((m) => (m.type === "action" && m.action.name === "write_text" ? [m.action.args.id] : []));
    expect(written).toEqual(["d"]);
  });

  it("restores the edits after a restart and rejects an unknown session", async () => {
    const { engine, session, repo } = await setup([[write("a"), write("b"), toolEvent("speak", { text: "Pronto." }), stopEvent()]]);
    await run(engine, session, opening);
    await engine.applyStudentEdit(session, { op: "remove", edit_id: "e1", element_id: "a" });
    const llm2 = new ScriptedLlm([[toolEvent("speak", { text: "Oi." }), stopEvent()]]);
    const engine2 = new TurnEngine({ llm: llm2, repo, retriever: retriever(), tts: null, draw: noopDraw, judge: noopJudge, prompts, models: { tutor: "m" } });
    expect(await engine2.applyStudentEdit(session, { op: "remove", edit_id: "e1", element_id: "a" })).toBe("already_applied");
    expect(await engine2.applyStudentEdit(session, { op: "remove", edit_id: "e9", element_id: "a" })).toBe("already_removed");
    await run(engine2, session, say("continue"));
    expect(boardOf(llm2.calls[0])).toBe("b | text | main | b\nRemoved by the student: a (text)");
    await expect(engine.applyStudentEdit("nope", { op: "remove", edit_id: "e1", element_id: "a" })).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("applies an edit that arrives while a turn is streaming, in order with the tutor's events", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let reached!: () => void;
    const atGate = new Promise<void>((r) => (reached = r));
    const llm: LlmClient = {
      async *stream() {
        yield write("a");
        reached();
        await gate;
        yield toolEvent("highlight", { target_id: "a", color: "yellow" });
        yield write("b");
        yield toolEvent("speak", { text: "Pronto." });
        yield stopEvent();
      },
    };
    const { engine, session, repo } = await setup([[stopEvent()]], { llm });
    const messages: StreamMessage[] = [];
    const turn = engine.run(session, opening, (m) => messages.push(m), new AbortController().signal);
    await atGate;
    expect(await engine.applyStudentEdit(session, { op: "remove", edit_id: "e1", element_id: "a" })).toBe("applied");
    release();
    await turn;
    await engine.idle();
    expect(actionNames(messages)).toEqual(["write_text", "write_text", "speak"]); // the highlight on the deleted "a" was dropped
    const order = (await repo.listEvents(session)).map((e) => (e.type === "tutor_action" ? `${(e.payload as { name: string }).name}` : e.type));
    expect(order).toEqual(["session_started", "write_text", "board_element_removed", "write_text", "speak", "turn_timing"]);
  });

  it("drops a draw_result for a picture the student deleted while it was being made", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const draw: DrawPipeline = {
      start: async (a) => {
        await gate;
        return [{ type: "action", order: 0, action: { id: "late", name: "draw_result", args: { element_id: a.args.id, url: "/api/gen/x.jpg" } } }];
      },
    };
    const { engine, session, repo } = await setup([[write("a"), toolEvent("draw", { id: "pic", column: "visuals", prompt: "Coliseu", is_structured: false, max_dimensions: { w: 500, h: 400 } }), toolEvent("speak", { text: "Veja." }), stopEvent()]], { draw });
    const messages: StreamMessage[] = [];
    const turn = engine.run(session, opening, (m) => messages.push(m), new AbortController().signal);
    await new Promise((r) => setTimeout(r, 20));
    expect(await engine.applyStudentEdit(session, { op: "remove", edit_id: "e1", element_id: "pic" })).toBe("applied");
    release();
    await turn;
    await engine.idle();
    expect(actionNames(messages)).not.toContain("draw_result");
    const names = (await repo.listEvents(session)).flatMap((e) => (e.type === "tutor_action" ? [(e.payload as { name: string }).name] : []));
    expect(names).not.toContain("draw_result");
  });
});
