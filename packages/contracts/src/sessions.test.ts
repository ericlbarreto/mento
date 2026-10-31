import { describe, expect, it } from "vitest";
import { Chunk, SearchQuery } from "./retrieval";
import { CreateSessionRequest, CreateSessionResponse, EndSessionRequest, FinishSessionResponse, ListSessionsQuery, ListSessionsResponse, ResumeSessionResponse, SessionDetailResponse, SessionSummary } from "./sessions";

describe("sessions", () => {
  it("creates a session from a student only (no material_id)", () => {
    expect(CreateSessionRequest.safeParse({ student_id: "stu_1", modality: "voice" }).success).toBe(true);
    expect(CreateSessionRequest.safeParse({ modality: "voice" }).success).toBe(false);
    expect(CreateSessionRequest.safeParse({ student_id: "stu_1", modality: "fax" }).success).toBe(false);
  });

  it("takes an optional or null subject_id (no subject = free whiteboard over all materials)", () => {
    expect(CreateSessionRequest.safeParse({ student_id: "stu_1", modality: "voice", subject_id: "6650f0c2a1b2c3d4e5f60701" }).success).toBe(true);
    expect(CreateSessionRequest.safeParse({ student_id: "stu_1", modality: "voice", subject_id: null }).success).toBe(true);
    expect(CreateSessionRequest.safeParse({ student_id: "stu_1", modality: "voice", subject_id: "" }).success).toBe(false);
    expect(CreateSessionResponse.safeParse({ id: "s1", subject_id: null }).success).toBe(true);
    expect(CreateSessionResponse.safeParse({ id: "s1", subject_id: "subj" }).success).toBe(true);
  });

  it("accepts the four end reasons", () => {
    for (const reason of ["user_left", "idle_timeout", "beacon", "manual"]) {
      expect(EndSessionRequest.safeParse({ reason }).success).toBe(true);
    }
    expect(EndSessionRequest.safeParse({ reason: "bored" }).success).toBe(false);
  });

  it("describes the idempotent finish and resume transitions", () => {
    expect(FinishSessionResponse.parse({ ok: true, transition: "finished" })).toEqual({ ok: true, transition: "finished" });
    expect(FinishSessionResponse.parse({ ok: true, transition: "already_finished" })).toEqual({ ok: true, transition: "already_finished" });
    expect(FinishSessionResponse.safeParse({ ok: true, transition: "resumed" }).success).toBe(false);
    expect(ResumeSessionResponse.parse({ ok: true, transition: "resumed" })).toEqual({ ok: true, transition: "resumed" });
    expect(ResumeSessionResponse.parse({ ok: true, transition: "already_active" })).toEqual({ ok: true, transition: "already_active" });
    expect(ResumeSessionResponse.safeParse({ ok: true, transition: "finished" }).success).toBe(false);
  });
});

describe("retrieval", () => {
  it("validates a chunk and bounds k", () => {
    const chunk = { id: "c1", material_id: "m1", subject: "history", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado..." };
    expect(Chunk.safeParse(chunk).success).toBe(true);
    expect(SearchQuery.safeParse({ query: "Augusto", k: 6 }).success).toBe(true);
    expect(SearchQuery.safeParse({ query: "Augusto", k: 0 }).success).toBe(false);
    expect(SearchQuery.safeParse({ query: "", k: 6 }).success).toBe(false);
    expect(SearchQuery.safeParse({ query: "Augusto", k: 6, material_ids: ["m1", "m2"] }).success).toBe(true);
  });
});

describe("session history", () => {
  const summary = {
    id: "6650f0c2a1b2c3d4e5f60799",
    student_id: "demo",
    modality: "voice",
    subject: { id: "6650f0c2a1b2c3d4e5f60701", name: "História", key: "history" },
    title: "Quero estudar os irmãos Graco",
    started_at: "2026-10-30T21:00:00.000Z",
    last_activity_at: "2026-10-30T21:05:00.000Z",
    ended_at: null,
    end_reason: null,
    turn_count: 3,
  };

  it("describes a session for the history list (free whiteboard has subject null)", () => {
    expect(SessionSummary.safeParse(summary).success).toBe(true);
    expect(SessionSummary.safeParse({ ...summary, subject: null, title: null }).success).toBe(true);
    expect(ListSessionsResponse.safeParse({ sessions: [summary] }).success).toBe(true);
  });

  it("returns a session with its events to re-render it", () => {
    const event = { id: "e1", session_id: summary.id, ts: "2026-10-30T21:00:01.000Z", type: "tutor_action", payload: { name: "speak", args: { text: "Oi" } } };
    expect(SessionDetailResponse.safeParse({ session: summary, events: [event] }).success).toBe(true);
  });

  it("bounds the history query", () => {
    expect(ListSessionsQuery.parse({})).toEqual({ limit: 20 });
    expect(ListSessionsQuery.parse({ limit: "5", student_id: "demo" })).toEqual({ limit: 5, student_id: "demo" });
    expect(ListSessionsQuery.safeParse({ limit: "500" }).success).toBe(false);
  });
});
