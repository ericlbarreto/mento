import { describe, expect, it } from "vitest";
import { Event, EventType, TurnRequest } from "./events";
import { FixtureTurn } from "./fixtures";
import { SessionEvent } from "./session-events";

describe("EventType", () => {
  it("is the closed list of contracts-spec section 3", () => {
    expect(EventType.options).toEqual([
      "session_started", "user_message", "tutor_action", "verification_asked", "verification_answered",
      "hint_given", "evidence_recorded", "interrupted", "mic_state", "turn_timing", "session_ended", "session_resumed",
      "board_element_removed", "board_element_moved",
    ]);
  });

  it("accepts a resumed-session audit event", () => {
    const ts = "2026-10-30T21:00:00.000Z";
    expect(EventType.parse("session_resumed")).toBe("session_resumed");
    expect(SessionEvent.parse({
      id: "e1",
      session_id: "s1",
      seq: 1,
      ts,
      type: "session_resumed",
      payload: { previous_ended_at: ts },
    }).type).toBe("session_resumed");
  });
});

describe("Event", () => {
  it("has a string id and ISO timestamp", () => {
    const e = { id: "6650f0c2a1b2c3d4e5f60718", session_id: "6650f0c2a1b2c3d4e5f60719", ts: "2026-10-30T21:00:00.000Z", type: "user_message", payload: { text: "oi" } };
    expect(Event.safeParse(e).success).toBe(true);
    expect(Event.safeParse({ ...e, ts: "ontem" }).success).toBe(false);
    expect(Event.safeParse({ ...e, id: 7 }).success).toBe(false);
  });
});

describe("TurnRequest", () => {
  it("allows an opening turn with no message", () => {
    expect(TurnRequest.safeParse({ modality: "voice", appended: [] }).success).toBe(true);
  });

  it("accepts a board_select message with the selected element", () => {
    const req = {
      modality: "voice",
      appended: [{ name: "user_message", kind: "board_select", text: "O que é isso?", selected: { element_id: "tl_republica", text: "27 a.C." }, stt: { provider: "deepgram", duration_ms: 1800, confidence: 0.94 } }],
      interrupted: { turn_id: "turn_1", action_id: "act_3", spoken_chars: 40, spoken_ms: 2100 },
      client_timing: { speech_end_to_audio_ms: 2300 },
    };
    expect(TurnRequest.safeParse(req).success).toBe(true);
  });

  it("accepts an answer to a verification", () => {
    const req = { modality: "text", appended: [{ name: "verification_answer", verification_id: "ver_1", element_id: "q_augusto", answer: "Foi em 27 a.C." }] };
    expect(TurnRequest.safeParse(req).success).toBe(true);
  });

  it("rejects an unknown message kind", () => {
    const req = { modality: "text", appended: [{ name: "user_message", kind: "shout", text: "x" }] };
    expect(TurnRequest.safeParse(req).success).toBe(false);
  });
});

describe("FixtureTurn", () => {
  it("wraps messages with a delay and rejects an invalid message", () => {
    const ok = { description: "x", messages: [{ at_ms: 0, message: { type: "script_done", turn_id: "turn_1" } }] };
    expect(FixtureTurn.safeParse(ok).success).toBe(true);
    const bad = { description: "x", messages: [{ at_ms: 0, message: { type: "nope" } }] };
    expect(FixtureTurn.safeParse(bad).success).toBe(false);
  });
});
