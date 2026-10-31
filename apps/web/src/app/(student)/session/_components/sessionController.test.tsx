// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Event, SessionDetailResponse, StreamMessage, SttCaption, TurnRequest } from "@mento/contracts";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { StreamTurn } from "@mento/board";
import { buildAppended, describeError, makeSelection, openingDelayMs, sttSummary } from "./sessionModel";
import { type SessionController, useSessionController } from "./useSessionController";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const NOW = "2026-10-30T12:00:00.000Z";
let seq = 0;
const ev = (type: Event["type"], payload: unknown, session_id = "s"): Event => ({ id: `ev_${++seq}`, session_id, ts: NOW, type, payload });

function detail(id: string, events: Event[] = [], modality: "text" | "voice" = "text"): SessionDetailResponse {
  return {
    session: {
      id,
      student_id: "demo-ana",
      modality,
      subject: { id: "subj_1", name: "História", key: "history" },
      title: null,
      started_at: NOW,
      last_activity_at: NOW,
      ended_at: null,
      end_reason: null,
      turn_count: 0,
    },
    events: [ev("session_started", { student_id: "demo-ana" }, id), ...events],
  };
}

const speak = (id: string, text: string, order: number): StreamMessage => ({
  type: "action",
  order,
  action: { id, name: "speak", args: { text } },
});

/** Records every turn request; `script` is what the stream sends for each call (then it resolves). */
function fakeStream(script: (call: number) => StreamMessage[] = () => []) {
  const calls: TurnRequest[] = [];
  const streamTurn: StreamTurn = vi.fn(async (_id, req, onMessage) => {
    calls.push(req);
    for (const m of script(calls.length - 1)) onMessage(m);
  });
  return { calls, streamTurn };
}

let root: Root | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
});

/** Mounts the hook in StrictMode (effects run, are cleaned up, and run again) and returns its latest value. */
async function mount(
  sessionId: string,
  events: Event[],
  streamTurn: StreamTurn,
  { modality = "text", holdVoiceOpening = false }: { modality?: "text" | "voice"; holdVoiceOpening?: boolean } = {},
) {
  const ref: { current: SessionController | null } = { current: null };
  const api = { getSession: vi.fn(async (id: string) => detail(id, events, modality)), streamTurn };
  function Harness() {
    ref.current = useSessionController({ sessionId, api, openingDelay: () => 0, holdVoiceOpening });
    return null;
  }
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root!.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
  });
  await settle();
  return { ref, api };
}

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 20)));

describe("session controller", () => {
  it("sends the opening turn exactly once under StrictMode's double effects", async () => {
    const { calls, streamTurn } = fakeStream();
    const { ref, api } = await mount("sess_open_once", [], streamTurn);
    expect(api.getSession).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([{ modality: "text", appended: [] }]);
    expect(ref.current?.phase).toBe("preparing");
  });

  it("does not send the opening turn when the session already has tutor actions (reopen)", async () => {
    const { calls, streamTurn } = fakeStream();
    const events = [
      ev("tutor_action", { turn_id: "turn_1", action_id: "a1", order: 0, name: "speak", args: { text: "Olá!" } }),
      ev("tutor_action", { turn_id: "turn_1", action_id: "a2", order: 1, name: "write_text", args: { id: "t1", column: "main", html: "<p>Roma</p>" } }),
    ];
    const { ref } = await mount("sess_reopen", events, streamTurn);
    expect(calls).toHaveLength(0);
    expect(ref.current?.phase).toBe("ready");
    expect(ref.current?.player.store.getElement("t1")).toBeDefined();
    expect(ref.current?.lines.map((l) => l.text)).toEqual(["Olá!"]);
  });

  it("sends a click-and-ask message as board_select with the selected element", async () => {
    const { calls, streamTurn } = fakeStream();
    const { ref } = await mount("sess_select", [ev("tutor_action", { turn_id: "t", action_id: "a", order: 0, name: "speak", args: { text: "Oi" } })], streamTurn);
    await act(async () => ref.current!.setSelection(makeSelection("tl_republica", "509 a.C. Início da República", "27 a.C.")));
    await act(async () => void ref.current!.sendMessage("O que aconteceu aqui?"));
    await settle();
    expect(calls.at(-1)?.appended).toEqual([
      { name: "user_message", kind: "board_select", text: "O que aconteceu aqui?", selected: { element_id: "tl_republica", text: "27 a.C." } },
    ]);
    expect(ref.current?.selection).toBeNull();
  });

  it("sends the open question's answer from the board as verification_answer", async () => {
    const { calls, streamTurn } = fakeStream();
    const events = [
      ev("tutor_action", {
        turn_id: "turn_1",
        action_id: "a1",
        order: 0,
        name: "ask_verification",
        args: { id: "q1", verification_id: "v1", concept: "Augusto", concept_key: "augusto", question: "Quem foi Augusto?", kind: "open" },
      }),
      ev("verification_asked", { verification_id: "v1", element_id: "q1", question: "Quem foi Augusto?" }),
    ];
    const { ref } = await mount("sess_verify", events, streamTurn);
    expect(ref.current?.openQuestion).toEqual({ verification_id: "v1", element_id: "q1" });
    await act(async () => ref.current!.answerQuestion({ element_id: "q1", verification_id: "v1", answer: "O primeiro imperador" }));
    await settle();
    expect(calls.at(-1)?.appended).toEqual([{ name: "verification_answer", verification_id: "v1", element_id: "q1", answer: "O primeiro imperador" }]);
    expect(ref.current?.openQuestion).toBeNull();
    expect(ref.current?.answered.get("q1")).toBe("O primeiro imperador");
  });

  it("interrupts the tutor mid-speech: the next turn carries interrupted { turn_id, action_id, spoken_ms }", async () => {
    // Opening turn: a long line and script_done; the line is still being "read" when the student sends.
    const { calls, streamTurn } = fakeStream((call) =>
      call === 0 ? [speak("act_1", "Hoje vamos ver como Roma deixou de ser uma República e virou um Império.", 0), { type: "script_done", turn_id: "turn_1" }] : [],
    );
    const { ref } = await mount("sess_interrupt", [], streamTurn);
    expect(ref.current?.speakingId).toBe("act_1");
    expect(ref.current?.orbState).toBe("speaking");
    await act(async () => void ref.current!.sendMessage("Espera, o que é República?"));
    await settle();
    expect(calls).toHaveLength(2);
    const second = calls[1]!;
    expect(second.appended).toEqual([{ name: "user_message", kind: "chat", text: "Espera, o que é República?" }]);
    expect(second.interrupted).toMatchObject({ turn_id: "turn_1", action_id: "act_1" });
    expect(second.interrupted?.spoken_ms).toEqual(expect.any(Number));
    expect(ref.current?.speakingId).toBeNull();
  });
});

const caption = (text: string): SttCaption => ({
  kind: "final",
  text,
  speech_final: true,
  words: [
    { word: "Quem", start_ms: 200, end_ms: 500, confidence: 0.9 },
    { word: "foi", start_ms: 520, end_ms: 700, confidence: 0.96 },
    { word: "Augusto?", start_ms: 720, end_ms: 2000, confidence: 0.96 },
  ],
});

describe("voice session", () => {
  it("holds a voice session's opening turn until the audio is unlocked, then sends it once with modality voice", async () => {
    const { calls, streamTurn } = fakeStream();
    const { ref } = await mount("sess_voice_hold", [], streamTurn, { modality: "voice", holdVoiceOpening: true });
    expect(calls).toHaveLength(0);
    expect(ref.current?.phase).toBe("preparing");
    await act(async () => ref.current!.releaseOpening());
    await act(async () => ref.current!.releaseOpening());
    await settle();
    expect(calls).toEqual([{ modality: "voice", appended: [] }]);
  });

  it("never holds a text session's opening turn", async () => {
    const { calls, streamTurn } = fakeStream();
    await mount("sess_text_nohold", [], streamTurn, { holdVoiceOpening: true });
    expect(calls).toEqual([{ modality: "text", appended: [] }]);
  });

  it("sends the final spoken caption as user_message kind speech with its STT summary, shown as voice in the chat", async () => {
    const { calls, streamTurn } = fakeStream();
    const { ref } = await mount("sess_speech", [ev("tutor_action", { turn_id: "t", action_id: "a", order: 0, name: "speak", args: { text: "Oi" } })], streamTurn, {
      modality: "voice",
    });
    await act(async () => void ref.current!.sendMessage("Quem foi Augusto?", "speech", caption("Quem foi Augusto?")));
    await settle();
    expect(calls.at(-1)).toEqual({
      modality: "voice",
      appended: [{ name: "user_message", kind: "speech", text: "Quem foi Augusto?", stt: { provider: "deepgram", duration_ms: 1800, confidence: 0.94 } }],
    });
    expect(ref.current?.lines.at(-1)).toMatchObject({ role: "student", text: "Quem foi Augusto?", via: "voice" });
  });

  it("turns a spoken question about a board selection into board_select (click-and-ask by voice)", async () => {
    const { calls, streamTurn } = fakeStream();
    const { ref } = await mount("sess_speech_select", [ev("tutor_action", { turn_id: "t", action_id: "a", order: 0, name: "speak", args: { text: "Oi" } })], streamTurn, {
      modality: "voice",
    });
    await act(async () => ref.current!.setSelection(makeSelection("tl_republica", "509 a.C. Início da República", "")));
    await act(async () => void ref.current!.sendMessage("O que é isso?", "speech", caption("O que é isso?")));
    await settle();
    expect(calls.at(-1)?.appended).toEqual([
      { name: "user_message", kind: "board_select", text: "O que é isso?", selected: { element_id: "tl_republica" }, stt: expect.objectContaining({ provider: "deepgram" }) },
    ]);
  });

  it("gives the floor to the student after script_done and the last speak, and keeps it with the tutor while it speaks", async () => {
    const { streamTurn } = fakeStream((call) =>
      call === 0 ? [speak("act_1", "Hoje vamos estudar a República romana e como ela terminou.", 0), { type: "script_done", turn_id: "turn_1" }] : [{ type: "script_done", turn_id: "turn_2" }],
    );
    const { ref } = await mount("sess_floor", [], streamTurn, { modality: "voice" });
    // script_done arrived, but the line is still playing: the mic stays muted.
    expect(ref.current?.speakingId).toBe("act_1");
    expect(ref.current?.tutorHasFloor).toBe(true);
    // A turn whose script is done and has nothing to play hands the floor back at once.
    await act(async () => void ref.current!.sendMessage("Pode repetir?"));
    await settle();
    expect(ref.current?.tutorHasFloor).toBe(false);
  });

  it("barge-in: interrupt() stops the tutor and the next spoken turn carries interrupted", async () => {
    const { calls, streamTurn } = fakeStream((call) =>
      call === 0 ? [speak("act_1", "Hoje vamos ver como Roma deixou de ser uma República e virou um Império.", 0), { type: "script_done", turn_id: "turn_1" }] : [],
    );
    const { ref } = await mount("sess_barge", [], streamTurn, { modality: "voice" });
    expect(ref.current?.tutorHasFloor).toBe(true);
    await act(async () => ref.current!.interrupt());
    expect(ref.current?.speakingId).toBeNull();
    expect(ref.current?.tutorHasFloor).toBe(false);
    expect(ref.current?.player.queueState).toBe("idle");
    await act(async () => void ref.current!.sendMessage("Espera, o que é Império?", "speech", caption("Espera, o que é Império?")));
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.interrupted).toMatchObject({ turn_id: "turn_1", action_id: "act_1", spoken_ms: expect.any(Number) });
    expect(calls[1]!.appended[0]).toMatchObject({ name: "user_message", kind: "speech" });
  });
});

describe("session model", () => {
  it("summarizes a final caption for the tutor (duration and mean confidence)", () => {
    expect(sttSummary(caption("Quem foi Augusto?"))).toEqual({ provider: "deepgram", duration_ms: 1800, confidence: 0.94 });
    expect(sttSummary({ kind: "final", text: "oi", words: [], speech_final: true })).toEqual({ provider: "deepgram", duration_ms: 0 });
  });

  it("answers the open question with a typed message, unless it is about a board selection", () => {
    const q = { verification_id: "v1", element_id: "q1" };
    expect(buildAppended("  Augusto  ", { openQuestion: q })).toEqual({ name: "verification_answer", verification_id: "v1", element_id: "q1", answer: "Augusto" });
    expect(buildAppended("E isso?", { openQuestion: q, selection: makeSelection("t1", "Roma antiga", "") })).toEqual({
      name: "user_message",
      kind: "board_select",
      text: "E isso?",
      selected: { element_id: "t1" },
    });
    expect(buildAppended("Oi", {})).toEqual({ name: "user_message", kind: "chat", text: "Oi" });
  });

  it("labels a selection with the selected text or the start of the element", () => {
    expect(makeSelection("t1", "  A   República romana durou quase cinco séculos e terminou com Augusto no poder  ", "").label).toBe(
      "A República romana durou quase cinco séculos e terminou com…",
    );
    expect(makeSelection("t1", "x", "a".repeat(500)).text).toHaveLength(400);
  });

  it("tells a missing session, a tutor without key and a stream error apart", () => {
    expect(describeError({ status: 404, error: "session_not_found" }).title).toBe("Conversa não encontrada");
    expect(describeError({ status: 503, error: "tutor_unavailable" }).title).toBe("O tutor está indisponível agora");
    expect(describeError(undefined, "LLM caiu")).toMatchObject({ kind: "stream", message: "LLM caiu" });
    expect(describeError(new TypeError("Failed to fetch")).kind).toBe("server");
  });

  it("waits up to 0.8 s after creation before the opening turn", () => {
    const created = Date.parse(NOW);
    expect(openingDelayMs(NOW, created + 100)).toBe(700);
    expect(openingDelayMs(NOW, created + 5000)).toBe(0);
    expect(openingDelayMs(undefined)).toBe(800);
  });
});
