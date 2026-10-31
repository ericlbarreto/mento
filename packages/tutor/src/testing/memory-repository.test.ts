import { describe, expect, it } from "vitest";
import { InMemoryTurnRepository } from "./memory-repository";

async function createSession(repo: InMemoryTurnRepository): Promise<string> {
  return (await repo.createSession({ student_id: "student-1", modality: "text" })).id;
}

describe("InMemoryTurnRepository session lifecycle", () => {
  it("finishes and resumes once per state transition", async () => {
    const repo = new InMemoryTurnRepository();
    const id = await createSession(repo);

    expect(await repo.finishSession(id, "manual")).toBe("finished");
    expect(await repo.finishSession(id, "manual")).toBe("already_finished");
    expect((await repo.listEvents(id)).filter((event) => event.type === "session_ended")).toHaveLength(1);
    expect((await repo.getSession(id))?.ended_at).not.toBeNull();

    expect(await repo.resumeSession(id)).toBe("resumed");
    expect(await repo.resumeSession(id)).toBe("already_active");
    expect((await repo.listEvents(id)).filter((event) => event.type === "session_resumed")).toHaveLength(1);
    expect((await repo.getSession(id))?.ended_at).toBeNull();
  });

  it("returns not_found without writing events", async () => {
    const repo = new InMemoryTurnRepository();

    expect(await repo.finishSession("missing", "manual")).toBe("not_found");
    expect(await repo.resumeSession("missing")).toBe("not_found");
    expect(await repo.listEvents("missing")).toEqual([]);
  });

  it("lets only one concurrent finish win", async () => {
    const repo = new InMemoryTurnRepository();
    const id = await createSession(repo);

    const transitions = await Promise.all([
      repo.finishSession(id, "manual"),
      repo.finishSession(id, "manual"),
    ]);

    expect(transitions.sort()).toEqual(["already_finished", "finished"]);
    expect((await repo.listEvents(id)).filter((event) => event.type === "session_ended")).toHaveLength(1);
  });
});
