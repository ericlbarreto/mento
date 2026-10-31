import { Event, SessionDetailResponse } from "@mento/contracts";
import { describe, expect, it } from "vitest";
import { replayEvents } from ".";
import { applyActions, applyEdit, applyAction, emptyBoard, type BoardState } from "../store";

const SID = "6ae54382ce3782e0372b0bb6";
let seq = 0;
const ev = (type: string, payload: unknown) => ({
  id: `ev_${++seq}`,
  session_id: SID,
  ts: new Date(Date.UTC(2026, 9, 30, 22, 10, seq)).toISOString(),
  type,
  payload,
});
const act = (turn_id: string, order: number, action_id: string, name: string, args: unknown) =>
  ev("tutor_action", { turn_id, action_id, order, name, args });
const source = { material_id: "6650f0c2a1b2c3d4e5f60718", page: 12, quote: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto" };

// Shaped like a stored session from GET /api/sessions/:id (two turns, an answered and an open verification).
const detail = SessionDetailResponse.parse({
  session: {
    id: SID,
    student_id: "demo-ana",
    modality: "text",
    subject: { id: "6ae53aef76bd0d7a98187cd2", name: "História", key: "history" },
    title: "O que foi 27 a.C.?",
    started_at: "2026-10-30T22:10:00.000Z",
    last_activity_at: "2026-10-30T22:11:40.000Z",
    ended_at: null,
    end_reason: null,
    turn_count: 3,
  },
  events: [
    ev("session_started", { student_id: "demo-ana", modality: "text", subject_id: "6ae53aef76bd0d7a98187cd2" }),
    act("turn_1", 0, "act_1", "write_text", { id: "title", column: "main", html: "<h1>Da República ao Império</h1>" }),
    act("turn_1", 1, "act_2", "speak", { text: "Hoje vamos ver como Roma deixou de ser uma República." }),
    act("turn_1", 2, "act_3", "draw", { id: "colosseum", column: "visuals", prompt: "Coliseu", is_structured: false, max_dimensions: { w: 500, h: 400 } }),
    act("turn_1", 3, "act_4", "write_timeline", { id: "tl_republica", column: "main", events: [{ date: "27 a.C.", label: "Augusto" }] }),
    act("turn_1", 4, "act_5", "ask_verification", { id: "q_rep", column: "main", verification_id: "ver_1", concept: "República", concept_key: "republica", question: "O que era a República?", kind: "explain" }),
    ev("verification_asked", { verification_id: "ver_1", element_id: "q_rep", concept: "República", concept_key: "republica", question: "O que era a República?", kind: "explain" }),
    act("turn_1", 5, "act_6", "draw_result", { element_id: "colosseum", url: "/api/gen/0123456789abcdef0123456789abcdef.jpg" }),
    ev("turn_timing", { turn_id: "turn_1", first_action_ms: 1200, last_action_ms: 4000 }),
    ev("verification_answered", { verification_id: "ver_1", element_id: "q_rep", answer: "Um governo com Senado" }),
    act("turn_2", 0, "act_7", "speak", { text: "Isso! E em 27 a.C. tudo mudou.", sources: [source] }),
    act("turn_2", 1, "act_8", "write_text", { id: "Bad-Id", column: "main", html: "<p>x</p>" }), // invalid: skipped
    act("turn_2", 2, "act_9", "unknown_tool", { id: "x" }), // invalid: skipped
    ev("user_message", { kind: "speech", text: "O que foi 27 a.C.?" }),
    ev("interrupted", { turn_id: "turn_2", action_id: "act_7" }),
    act("turn_3", 0, "act_10", "highlight", { target_id: "tl_republica", color: "yellow" }),
    act("turn_3", 1, "act_11", "ask_verification", { id: "q_aug", column: "main", verification_id: "ver_2", concept: "Augusto", concept_key: "augusto", question: "Quem foi Augusto?", kind: "explain" }),
    ev("verification_asked", { verification_id: "ver_2", element_id: "q_aug", concept: "Augusto", concept_key: "augusto", question: "Quem foi Augusto?", kind: "explain" }),
    ev("user_message", { kind: "board_select", text: "e isso?", selected: { element_id: "tl_republica", text: "27 a.C." } }),
    ev("tutor_action", "not an object"),
  ],
});

describe("replayEvents", () => {
  const r = replayEvents(detail.events);

  it("keeps valid tutor actions in event order, built as { id: action_id, name, args }", () => {
    expect(r.actions.map((a) => a.id)).toEqual(["act_1", "act_2", "act_3", "act_4", "act_5", "act_6", "act_7", "act_10", "act_11"]);
    expect(r.actions[0]).toEqual({ id: "act_1", name: "write_text", args: { id: "title", column: "main", html: "<h1>Da República ao Império</h1>" } });
    expect(r.tutorActionCount).toBe(12);
  });

  it("the actions rebuild the board, image included", () => {
    const board = applyActions(emptyBoard(), r.actions);
    expect([...board.elements.keys()]).toEqual(["title", "colosseum", "tl_republica", "q_rep", "q_aug"]);
    expect(board.elements.get("colosseum")).toMatchObject({ status: "ready", data: { url: "/api/gen/0123456789abcdef0123456789abcdef.jpg" } });
    expect(board.elements.get("tl_republica")?.annotations).toHaveLength(1);
  });

  it("rebuilds the transcript from speak, user_message and verification_answered", () => {
    expect(r.transcript.map((l) => [l.role, l.text, l.via])).toEqual([
      ["tutor", "Hoje vamos ver como Roma deixou de ser uma República.", undefined],
      ["student", "Um governo com Senado", undefined],
      ["tutor", "Isso! E em 27 a.C. tudo mudou.", undefined],
      ["student", "O que foi 27 a.C.?", "voice"],
      ["student", "e isso?", "text"],
    ]);
    expect(r.transcript[2]?.sources).toEqual([source]);
    expect(r.transcript[0]?.sources).toBeUndefined();
    expect(r.transcript[1]?.at).toBe(detail.events[9]?.ts);
  });

  it("finds the open verification and the last turn id", () => {
    expect(r.openVerification).toEqual({ verification_id: "ver_2", element_id: "q_aug", question: "Quem foi Augusto?" });
    expect(r.lastTurnId).toBe("turn_3");
  });

  it("an answered last question leaves nothing open", () => {
    const events = detail.events.slice(0, 10);
    expect(replayEvents(events).openVerification).toBeNull();
  });

  it("a fresh session has nothing to replay", () => {
    const fresh = replayEvents(detail.events.slice(0, 1));
    expect(fresh).toEqual({ actions: [], steps: [], transcript: [], openVerification: null, lastTurnId: null, tutorActionCount: 0 });
  });
  it("keeps a stored circle_annotate on its timeline after replay", () => {
    // Stored shape of the live turn's actions (tutor_action payloads, same session).
    const events = [
      act("turn_9", 1, "act_9_1", "write_timeline", {
        id: "linha_republica",
        column: "main",
        events: [{ date: "509 a.C.", label: "Data tradicional da implantação da República" }],
      }),
      act("turn_9", 2, "act_9_2", "circle_annotate", { target_id: "linha_republica", text_to_match: "509 a.C.", color: "red" }),
    ];
    const board = applyActions(emptyBoard(), replayEvents(events.map((e) => Event.parse(e))).actions);
    expect(board.elements.get("linha_republica")?.annotations).toEqual([
      { kind: "circle", color: "red", text_to_match: "509 a.C.", action_id: "act_9_2" },
    ]);
  });

  it("interleaves the student's board edits with the actions, in event order", () => {
    const events = [
      act("turn_1", 0, "a1", "write_text", { id: "titulo", column: "main", html: "<h1>Roma</h1>" }),
      act("turn_1", 1, "a2", "write_text", { id: "nota", column: "main", html: "<p>Nota</p>" }),
      act("turn_1", 2, "a3", "draw", { id: "coliseu", column: "visuals", prompt: "Coliseu", is_structured: false, max_dimensions: { w: 500, h: 400 } }),
      ev("board_element_moved", { element_id: "nota", column: "side", after_id: null, edit_id: "e1" }),
      ev("board_element_removed", { element_id: "coliseu", edit_id: "e2" }),
      ev("board_element_moved", { element_id: "nota", column: "nowhere", after_id: null, edit_id: "e3" }), // invalid: skipped
      act("turn_1", 3, "a4", "draw_result", { element_id: "coliseu", url: "/api/gen/0123456789abcdef0123456789abcdef.jpg" }),
      act("turn_2", 0, "a5", "write_text", { id: "fim", column: "main", html: "<p>Fim</p>" }),
    ].map((e) => Event.parse(e));
    const { steps, actions } = replayEvents(events);
    expect(actions).toHaveLength(5);
    expect(steps.map((s) => (s.kind === "action" ? s.action.id : `${s.edit.op}:${s.edit.element_id}`))).toEqual([
      "a1", "a2", "a3", "move:nota", "remove:coliseu", "a4", "a5",
    ]);
    expect(steps[3]).toEqual({ kind: "edit", edit: { op: "move", element_id: "nota", column: "side", after_id: null } });
    const board = steps.reduce<BoardState>(
      (b, s) => (s.kind === "action" ? applyAction(b, s.action) : applyEdit(b, s.edit)),
      emptyBoard(),
    );
    expect(board.columns).toEqual({ main: ["titulo", "fim"], visuals: [], side: ["nota"] });
    expect(board.elements.has("coliseu")).toBe(false);
  });
});
