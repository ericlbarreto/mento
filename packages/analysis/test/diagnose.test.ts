import { describe, expect, it } from "vitest";
import type { Lesson } from "@mento/contracts";
import { ancestorsOf, diagnose } from "../src";
import { LESSONS } from "./helpers";

type Row = { lesson_id: string | null; result: "correct" | "partial" | "incorrect"; independent: boolean };
const row = (lesson_id: string | null, result: Row["result"] = "incorrect", independent = true): Row => ({ lesson_id, result, independent });
const run = (studying: string | null, rows: Row[], sequence: Lesson[] = LESSONS) => diagnose({ studying_lesson_id: studying, evidence: rows, sequence });

describe("diagnosis by the prerequisite graph (BR-05)", () => {
  it("BR-05 same lesson as the one being studied → current_topic", () => {
    expect(run("L4", [row("L4")])).toEqual({ diagnosis: "current_topic", root_cause: null });
  });

  it("BR-05 direct prerequisite → prerequisite with that lesson as root", () => {
    const d = run("L6", [row("L2")]);
    expect(d.diagnosis).toBe("prerequisite");
    expect(d.root_cause).toMatchObject({ lesson_id: "L2", pages: [20, 25], taught_in_class: true });
  });

  it("BR-05 transitive prerequisite (L1 reaches L6 through L2) → L1", () => {
    expect(run("L6", [row("L1")]).root_cause?.lesson_id).toBe("L1");
    expect([...ancestorsOf("L6", LESSONS)].sort()).toEqual(["L1", "L2", "L3", "L4"]);
  });

  it("BR-05 two ancestors tied on errors → the lower order wins", () => {
    expect(run("L7", [row("L6"), row("L3")]).root_cause?.lesson_id).toBe("L3");
  });

  it("BR-05 the ancestor with more incorrect answers wins; hint-assisted answers break the next tie", () => {
    expect(run("L7", [row("L3", "correct", false), row("L6", "incorrect")]).root_cause?.lesson_id).toBe("L6");
    expect(run("L7", [row("L3", "correct", false), row("L3", "correct", false), row("L6", "correct", false)]).root_cause?.lesson_id).toBe("L3");
  });

  it("BR-05 a strong (independent, correct) answer in an earlier lesson is not a cause", () => {
    expect(run("L6", [row("L2", "correct", true), row("L6", "incorrect")])).toEqual({ diagnosis: "current_topic", root_cause: null });
  });

  it("BR-05 no lesson_id, no studying lesson, or lessons outside the sequence → null", () => {
    expect(run("L6", [row(null)]).diagnosis).toBeNull();
    expect(run(null, [row("L2")]).diagnosis).toBeNull();
    expect(run("L99", [row("L2")]).diagnosis).toBeNull();
    expect(run("L6", [row("L99")]).diagnosis).toBeNull();
  });

  it("BR-05 a later lesson is never a root cause of an earlier one", () => {
    expect(run("L2", [row("L6")]).diagnosis).toBeNull();
  });

  it("BR-05 cycles in the prerequisites do not loop forever", () => {
    const cyclic = [
      { ...LESSONS[0]!, lesson_id: "A", order: 1, prerequisites: ["B"] },
      { ...LESSONS[1]!, lesson_id: "B", order: 2, prerequisites: ["A"] },
    ];
    expect([...ancestorsOf("A", cyclic)]).toEqual(["B"]);
    expect(run("A", [row("B")], cyclic).root_cause?.lesson_id).toBe("B");
  });
});
