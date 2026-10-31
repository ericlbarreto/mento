import { describe, expect, it } from "vitest";
import { Chunk, SearchQuery } from "./retrieval";
import { CreateSessionRequest, CreateSessionResponse, EndSessionRequest } from "./sessions";

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
