import type { SessionSummary } from "@mento/contracts";
import { describe, expect, it } from "vitest";
import { bookCount, firstName, lastSessionLabel, relativeTime, sessionMinutes, sessionSubtitle, sessionTitle, subjectIcon } from "./format";

const now = new Date("2026-10-30T15:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;

const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  id: "s1",
  student_id: "demo-ana",
  modality: "text",
  subject: { id: "sub1", name: "História", key: "history" },
  title: "Por que Roma virou império?",
  started_at: ago(20 * MIN),
  last_activity_at: ago(5 * MIN),
  ended_at: null,
  end_reason: null,
  turn_count: 4,
  ...over,
});

describe("subjectIcon", () => {
  it("maps known keys and falls back to the book", () => {
    expect(subjectIcon("history")).toBe("landmark");
    expect(subjectIcon("math")).toBe("ruler");
    expect(subjectIcon("generic")).toBe("book");
    expect(subjectIcon("geography")).toBe("book");
  });
});

describe("relativeTime", () => {
  it("formats past times in pt-BR", () => {
    expect(relativeTime(ago(10_000), now)).toBe("agora há pouco");
    expect(relativeTime(ago(5 * MIN), now)).toBe("há 5 min");
    expect(relativeTime(ago(3 * 60 * MIN), now)).toBe("há 3 h");
    expect(relativeTime(ago(30 * 60 * MIN), now)).toBe("ontem");
    expect(relativeTime(ago(4 * 24 * 60 * MIN), now)).toBe("há 4 dias");
    expect(relativeTime("2026-09-12T12:00:00.000Z", now)).toBe("12/09");
  });

  it("treats future or invalid dates as just now", () => {
    expect(relativeTime(ago(-5 * MIN), now)).toBe("agora há pouco");
    expect(relativeTime("not a date", now)).toBe("agora há pouco");
  });
});

describe("session text", () => {
  it("builds the continue subtitle with the subject or Lousa livre", () => {
    expect(sessionSubtitle(session(), now)).toBe("História · 4 interações · há 5 min");
    expect(sessionSubtitle(session({ subject: null, turn_count: 1 }), now)).toBe("Lousa livre · 1 interação · há 5 min");
  });

  it("falls back to an untitled label", () => {
    expect(sessionTitle(session({ title: null }))).toBe("Conversa sem título");
    expect(sessionTitle(session({ title: "  " }))).toBe("Conversa sem título");
  });

  it("measures duration to the end or the last activity, at least 1 min", () => {
    expect(sessionMinutes(session())).toBe(15);
    expect(sessionMinutes(session({ ended_at: ago(2 * MIN) }))).toBe(18);
    expect(sessionMinutes(session({ started_at: ago(5 * MIN) }))).toBe(1);
    expect(lastSessionLabel(session())).toBe("Por que Roma virou império? · 15 min");
  });
});

describe("small labels", () => {
  it("counts books and takes the first name", () => {
    expect(bookCount(1)).toBe("1 livro");
    expect(bookCount(0)).toBe("0 livros");
    expect(bookCount(3)).toBe("3 livros");
    expect(firstName("Ana S.")).toBe("Ana");
    expect(firstName("  Bruno  ")).toBe("Bruno");
  });
});
