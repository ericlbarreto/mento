import { describe, expect, it } from "vitest";
import { InMemoryTurnRepository } from "@mento/tutor/testing";
import { withCatalog } from "./with-catalog";

const base = () => new InMemoryTurnRepository({ catalog: [{ material_id: "demo", title: "Demo", subject: "history", chapters: [] }] });
const mongoCatalog = [{ material_id: "m1", title: "História de Roma", subject: "history", chapters: ["A República"] }];

describe("withCatalog", () => {
  it("uses the catalog from MongoDB when it is available and not empty", async () => {
    const repo = withCatalog(base(), async () => mongoCatalog, () => true);
    expect(await repo.getCatalog()).toEqual(mongoCatalog);
  });

  it("falls back to the base repository when MongoDB is offline, empty or failing", async () => {
    const demo = (await base().getCatalog())[0]!.material_id;
    expect((await withCatalog(base(), async () => mongoCatalog, () => false).getCatalog())[0]!.material_id).toBe(demo);
    expect((await withCatalog(base(), async () => [], () => true).getCatalog())[0]!.material_id).toBe(demo);
    expect((await withCatalog(base(), async () => { throw new Error("down"); }, () => true).getCatalog())[0]!.material_id).toBe(demo);
  });

  it("does not wait for MongoDB when it is offline", async () => {
    let called = 0;
    await withCatalog(base(), async () => (called++, mongoCatalog), () => false).getCatalog();
    expect(called).toBe(0);
  });

  it("forwards every other repository call", async () => {
    const repo = withCatalog(base(), async () => mongoCatalog, () => true);
    const { id } = await repo.createSession({ student_id: "stu_1", modality: "text" });
    expect(await repo.getSession(id)).toMatchObject({ student_id: "stu_1" });
    await repo.appendEvent(id, { type: "mic_state", payload: { muted: false } });
    expect((await repo.listEvents(id)).map((e) => e.type)).toEqual(["session_started", "mic_state"]);
    await repo.endSession(id, "manual");
    expect((await repo.listEvents(id)).at(-1)?.type).toBe("session_ended");
  });

  it("asks MongoDB for one subject's catalog and returns it even when empty", async () => {
    const asked: (string | undefined)[] = [];
    const repo = withCatalog(base(), async (subject_id) => (asked.push(subject_id), []), () => true);
    expect(await repo.getCatalog("subj_math")).toEqual([]);
    expect(asked).toEqual(["subj_math"]);
  });
});

