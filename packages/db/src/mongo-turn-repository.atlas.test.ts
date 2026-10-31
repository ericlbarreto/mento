import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectMongo, disconnectMongo } from "./connection";
import { EventModel } from "./models/event.model";
import { EvidenceModel } from "./models/evidence.model";
import { SessionModel } from "./models/session.model";
import { MongoEvidenceStore, MongoTurnRepository } from "./mongo-turn-repository";

// Runs only against a real Atlas cluster: ATLAS_TEST_URI=mongodb+srv://... pnpm --filter @mento/db test
const uri = process.env.ATLAS_TEST_URI;

describe.skipIf(!uri)("MongoTurnRepository on Atlas", () => {
  const repo = new MongoTurnRepository();
  const student_id = `test-${Date.now()}`;
  const subject = { id: "6650f0c2a1b2c3d4e5f60701", name: "História", key: "history" };

  beforeAll(async () => {
    await connectMongo(uri as string);
  }, 60_000);

  afterAll(async () => {
    const ids = (await SessionModel.find({ student_id }).lean<{ _id: unknown }[]>()).map((s) => String(s._id));
    await EventModel.deleteMany({ session_id: { $in: ids } });
    await EvidenceModel.deleteMany({ student_id });
    await SessionModel.deleteMany({ student_id });
    await disconnectMongo();
  });

  it("stores a session with its subject, events in order, title, turn count and end", async () => {
    const { id } = await repo.createSession({ student_id, modality: "voice", subject });
    expect(await repo.getSession(id)).toEqual({ id, student_id, modality: "voice", subject });
    await repo.appendEvent(id, { type: "tutor_action", payload: { turn_id: "turn_1", name: "speak", args: { text: "Oi!" } } });
    await repo.appendEvent(id, { type: "turn_timing", payload: { turn_id: "turn_1", first_action_ms: 900 } });
    await repo.appendEvent(id, { type: "user_message", payload: { kind: "speech", text: "Quero estudar os irmãos Graco e a reforma agrária na República romana, por favor" } });
    await repo.appendEvent(id, { type: "user_message", payload: { kind: "chat", text: "segunda mensagem" } });
    await repo.appendEvent(id, { type: "turn_timing", payload: { turn_id: "turn_2" } });
    await repo.endSession(id, "user_left");

    const events = await repo.listEvents(id);
    expect(events.map((e) => e.type)).toEqual(["session_started", "tutor_action", "turn_timing", "user_message", "user_message", "turn_timing", "session_ended"]);
    expect(events[0]?.payload).toMatchObject({ student_id, modality: "voice", subject_id: subject.id });
    expect(events[1]?.payload).toEqual({ turn_id: "turn_1", name: "speak", args: { text: "Oi!" } });

    const summary = await repo.getSessionSummary(id);
    expect(summary).toMatchObject({ id, student_id, subject, title: "Quero estudar os irmãos Graco e a reforma agrária na República romana, por favor".slice(0, 80), turn_count: 2, end_reason: "user_left" });
    expect(summary?.ended_at).not.toBeNull();
  }, 60_000);

  it("lists sessions newest first, filtered by student and subject", async () => {
    const a = await repo.createSession({ student_id, modality: "text", subject: null });
    await new Promise((r) => setTimeout(r, 20));
    const b = await repo.createSession({ student_id, modality: "text", subject });
    await repo.appendEvent(b.id, { type: "user_message", payload: { kind: "chat", text: "oi" } });
    const all = await repo.listSessions({ student_id, limit: 10 });
    expect(all[0]?.id).toBe(b.id);
    expect(all.map((s) => s.id)).toContain(a.id);
    const history = await repo.listSessions({ student_id, subject_id: subject.id, limit: 10 });
    expect(history.every((s) => s.subject?.id === subject.id)).toBe(true);
    expect(history.map((s) => s.id)).not.toContain(a.id);
    expect(await repo.getSession("not-an-id")).toBeNull();
  }, 60_000);

  it("stores evidence rows", async () => {
    const { id } = await repo.createSession({ student_id, modality: "text" });
    const { id: evidenceId } = await new MongoEvidenceStore().insertEvidence({
      session_id: id, student_id, concept: "Revolta dos Gracos", concept_key: "revolta dos gracos",
      result: "correct", independent: true, hints_used: 0, rationale: "Explicou bem.",
      citation: { material_id: "m1", page: 329, quote: "x" },
    });
    expect(await EvidenceModel.findById(evidenceId).lean()).toMatchObject({ session_id: id, result: "correct", concept_key: "revolta dos gracos" });
  }, 60_000);
});
