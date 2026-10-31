import { describe, expect, it } from "vitest";
import { CreateSubjectRequest, ListSubjectsResponse, SubjectSummary } from "./subjects";

const history = {
  id: "6650f0c2a1b2c3d4e5f60701",
  name: "História",
  key: "history",
  material_count: 1,
  materials: [{ id: "6ae53926f993a3144c5d6786", title: "História de Roma Antiga I", pages: 489, status: "ready" }],
};

describe("subjects", () => {
  it("describes a subject with its ready materials and their count", () => {
    expect(SubjectSummary.safeParse(history).success).toBe(true);
    expect(ListSubjectsResponse.safeParse({ subjects: [history, { ...history, id: "x", name: "Matemática", key: "math", material_count: 0, materials: [] }] }).success).toBe(true);
  });

  it("requires a slug key and a display name to create a subject", () => {
    expect(CreateSubjectRequest.safeParse({ name: "História", key: "history" }).success).toBe(true);
    expect(CreateSubjectRequest.safeParse({ name: "História", key: "História" }).success).toBe(false);
    expect(CreateSubjectRequest.safeParse({ name: "", key: "history" }).success).toBe(false);
  });
});
