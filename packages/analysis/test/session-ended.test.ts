import { describe, expect, it } from "vitest";
import { SessionEndedHandler } from "../src";
import { labWorld } from "./helpers";

describe("the analysis starts when a conversation ends (BR-29)", () => {
  it("BR-29 it waits until every answer has been judged, then analyses", async () => {
    const w = await labWorld();
    const checks: string[] = [];
    let polls = 0;
    const handler = new SessionEndedHandler(w.service, {
      isSettled: async () => (checks.push("settled?"), ++polls >= 3),
      sleep: async () => void checks.push("wait"),
    });
    const before = await w.repo.getAnalysisBySession("ses_ana_01");
    await handler.handle("ses_ana_01");
    expect(before).toBeNull();
    expect(checks).toEqual(["settled?", "wait", "settled?", "wait", "settled?"]); // two waits, then it went ahead
    expect((await w.repo.getAnalysisBySession("ses_ana_01"))?.status).toBe("done");
  });

  it("BR-29 it does not wait forever: after the maximum wait it analyses with what is stored (a failed judgment never records evidence)", async () => {
    const w = await labWorld();
    const sleeps: number[] = [];
    const handler = new SessionEndedHandler(w.service, { isSettled: async () => false, maxWaitMs: 3_000, pollMs: 1_000, sleep: async (ms) => void sleeps.push(ms) });
    await handler.handle("ses_ana_01");
    expect(sleeps).toEqual([1_000, 1_000, 1_000]);
    expect((await w.repo.getAnalysisBySession("ses_ana_01"))?.status).toBe("done");
  });

  it("BR-29 a conversation that should not be analysed (unknown student) is left alone", async () => {
    const w = await labWorld();
    const handler = new SessionEndedHandler(w.service, { shouldAnalyze: async () => false, isSettled: async () => { throw new Error("must not be asked"); } });
    await handler.handle("ses_ana_01");
    expect(await w.repo.getAnalysisBySession("ses_ana_01")).toBeNull();
    expect(await w.repo.listInsights()).toEqual([]);
  });

  it("BR-29 a problem while preparing is logged and the analysis is still attempted", async () => {
    const w = await labWorld();
    const logged: string[] = [];
    const handler = new SessionEndedHandler(w.service, { isSettled: async () => { throw new Error("db hiccup"); }, log: (m) => void logged.push(m) });
    await handler.handle("ses_ana_01");
    expect(logged[0]).toContain("could not prepare");
    expect((await w.repo.getAnalysisBySession("ses_ana_01"))?.status).toBe("done");
  });

  it("BR-29 idle() resolves once the handlers in progress are done", async () => {
    const w = await labWorld();
    const handler = new SessionEndedHandler(w.service, {});
    const running = handler.handle("ses_ana_01");
    await handler.idle();
    await running;
    expect((await w.repo.getAnalysisBySession("ses_ana_01"))?.status).toBe("done");
  });
});
