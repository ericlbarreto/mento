import type { SessionSummary } from "@mento/contracts";
import { describe, expect, it } from "vitest";
import {
  countByFilter,
  drawerTitle,
  historyDate,
  historyDuration,
  historyTitle,
  interactions,
  newConversationLabel,
  visibleSessions,
} from "./historyModel";

// Local time, like the drawer renders it.
const now = new Date(2026, 9, 30, 15, 0);
const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m, d, h, min).toISOString();
const MIN = 60_000;

const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  id: "s1",
  student_id: "demo-ana",
  modality: "voice",
  subject: { id: "sub1", name: "História", key: "history" },
  title: "Por que Roma virou império?",
  started_at: at(2026, 9, 30, 9, 41),
  last_activity_at: at(2026, 9, 30, 9, 53),
  ended_at: null,
  end_reason: null,
  turn_count: 4,
  ...over,
});

const list = [
  session({ id: "a", title: "Crise agrária e os Graco", started_at: at(2026, 9, 14), ended_at: at(2026, 9, 14, 10, 22) }),
  session({ id: "cur" }),
  session({ id: "b", title: null, started_at: at(2026, 9, 2) }),
  session({ id: "c", title: "Patrícios e plebeus", started_at: at(2026, 9, 2), ended_at: at(2026, 9, 2, 11) }),
];

describe("countByFilter", () => {
  it("counts all, in progress (no ended_at) and ended", () => {
    expect(countByFilter(list)).toEqual({ all: 4, active: 2, ended: 2 });
    expect(countByFilter([])).toEqual({ all: 0, active: 0, ended: 0 });
  });
});

describe("visibleSessions", () => {
  const ids = (xs: SessionSummary[]) => xs.map((s) => s.id);

  it("pins the current session first and keeps the API order for the rest", () => {
    expect(ids(visibleSessions(list, { filter: "all", query: "", currentId: "cur", now }))).toEqual(["cur", "a", "b", "c"]);
    expect(ids(visibleSessions(list, { filter: "all", query: "", now }))).toEqual(["a", "cur", "b", "c"]);
  });

  it("filters by status", () => {
    expect(ids(visibleSessions(list, { filter: "active", query: "", currentId: "cur", now }))).toEqual(["cur", "b"]);
    expect(ids(visibleSessions(list, { filter: "ended", query: "", currentId: "cur", now }))).toEqual(["a", "c"]);
  });

  it("searches titles ignoring case and accents, untitled sessions by their placeholder, and dates", () => {
    expect(ids(visibleSessions(list, { filter: "all", query: "IMPERIO", now }))).toEqual(["cur"]);
    expect(ids(visibleSessions(list, { filter: "all", query: "sem título", now }))).toEqual(["b"]);
    expect(ids(visibleSessions(list, { filter: "all", query: "14 de outubro", now }))).toEqual(["a"]);
    expect(ids(visibleSessions(list, { filter: "ended", query: "graco", now }))).toEqual(["a"]);
    expect(visibleSessions(list, { filter: "active", query: "graco", now })).toEqual([]);
  });
});

describe("historyDate", () => {
  it("reads today and yesterday with the time, then the long date", () => {
    expect(historyDate(at(2026, 9, 30, 9, 41), now)).toBe("Hoje, 09:41");
    expect(historyDate(at(2026, 9, 29, 18, 5), now)).toBe("Ontem, 18:05");
    expect(historyDate(at(2026, 9, 14), now)).toBe("14 de outubro");
    expect(historyDate(at(2025, 11, 2), now)).toBe("2 de dezembro de 2025");
    expect(historyDate("not a date", now)).toBe("");
  });
});

describe("historyDuration", () => {
  it("is last activity minus start, in whole minutes", () => {
    expect(historyDuration(session())).toBe("12 min");
    const start = at(2026, 9, 30, 9, 0);
    expect(historyDuration(session({ started_at: start, last_activity_at: new Date(Date.parse(start) + 22.9 * MIN).toISOString() }))).toBe("22 min");
    expect(historyDuration(session({ started_at: start, last_activity_at: start }))).toBe("< 1 min");
  });
});

describe("labels", () => {
  it("uses the subject name when there is one", () => {
    expect(drawerTitle("História")).toBe("Histórico de Aulas de História");
    expect(drawerTitle(null)).toBe("Histórico de Aulas");
    expect(newConversationLabel("História")).toBe("Iniciar nova conversa de História");
    expect(newConversationLabel(undefined)).toBe("Iniciar nova conversa");
    expect(historyTitle(session({ title: "  " }))).toBe("Conversa sem título");
    expect(interactions(1)).toBe("1 interação");
    expect(interactions(0)).toBe("0 interações");
  });
});
