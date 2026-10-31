import { describe, expect, it } from "vitest";
import { parseChapters } from "./chapters";

describe("parseChapters", () => {
  it("parses title:start-end items separated by semicolons", () => {
    expect(parseChapters("A República:1-40; O Império:41-90")).toEqual([
      { title: "A República", start_page: 1, end_page: 40 },
      { title: "O Império", start_page: 41, end_page: 90 },
    ]);
    expect(parseChapters("")).toEqual([]);
  });

  it("rejects malformed or reversed ranges", () => {
    expect(() => parseChapters("sem intervalo")).toThrow("expected title:start-end");
    expect(() => parseChapters("X:9-2")).toThrow("start is after end");
  });
});
