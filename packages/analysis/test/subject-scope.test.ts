import { describe, expect, it } from "vitest";
import type { ConversationSource, Insight, Session, SessionBundle, SubjectSummary, TeacherRepository } from "@mento/contracts";
import { SubjectScope } from "../src";

const subject = (id: string, key: string): SubjectSummary => ({ id, key, name: key, material_count: 0, materials: [] });
const SUBJECTS = [subject("sub_hist", "history"), subject("sub_math", "math")];

const session = (id: string, subject_id: string | null | undefined): Session => ({
  id, student_id: "stu", material_id: null, lesson_id: null, modality: "text", status: "ended", started_at: `2026-11-01T10:0${id.length % 10}:00Z`, is_simulated: false,
  ...(subject_id !== undefined ? { subject_id } : {}),
});
const SESSIONS = [session("hist", "sub_hist"), session("math", "sub_math"), session("free", null), session("lab", undefined)];

function source(): ConversationSource {
  const bundle = (s: Session): SessionBundle => ({ session: s, events: [], evidence: [] });
  return {
    listAllSessions: async () => SESSIONS,
    listSessionsByStudent: async (id) => SESSIONS.filter((s) => s.student_id === id),
    getSessionBundle: async (id) => {
      const s = SESSIONS.find((x) => x.id === id);
      return s ? bundle(s) : null;
    },
  };
}

const insight = (id: string, session_id: string) => ({ id, session_id, student_id: "stu", kind: "gap" }) as Insight;
const INSIGHTS = [insight("i_hist", "hist"), insight("i_math", "math"), insight("i_free", "free"), insight("i_fixture", "ses_ana_01")];

/** Only the reads the scope filters; the rest of the repository is not used here. */
const fakeRepo = {
  listInsights: async () => INSIGHTS,
  getInsight: async (id: string) => INSIGHTS.find((i) => i.id === id) ?? null,
  getAnalysisBySession: async (sessionId: string) => ({ session_id: sessionId }),
} as unknown as TeacherRepository;

const scope = (key = "history") => new SubjectScope({ key, subjects: { list: async () => SUBJECTS }, conversations: source() });

describe("the teacher side follows one subject (D78)", () => {
  it("keeps the subject's conversations and the ones that do not record a subject; leaves out other subjects and the free whiteboard", async () => {
    const conversations = scope().conversations();
    expect((await conversations.listAllSessions()).map((s) => s.id)).toEqual(["hist", "lab"]);
    expect((await conversations.listSessionsByStudent("stu")).map((s) => s.id)).toEqual(["hist", "lab"]);
    expect(await conversations.getSessionBundle("hist")).not.toBeNull();
    expect(await conversations.getSessionBundle("math")).toBeNull();
    expect(await conversations.getSessionBundle("free")).toBeNull();
  });

  it("hides insights and analyses of other subjects and of the free whiteboard; hides those whose session is not a conversation (lab mocks)", async () => {
    const repo = scope().repo(fakeRepo);
    expect((await repo.listInsights()).map((i) => i.id)).toEqual(["i_hist"]);
    expect(await repo.getInsight("i_math")).toBeNull();
    expect(await repo.getInsight("i_fixture")).toBeNull();
    expect(await repo.getAnalysisBySession("math")).toBeNull();
    expect(await repo.getAnalysisBySession("hist")).not.toBeNull();
  });

  it("leaves out every recorded subject when the teacher's subject does not exist", async () => {
    expect((await scope("chemistry").conversations().listAllSessions()).map((s) => s.id)).toEqual(["lab"]);
  });
});
