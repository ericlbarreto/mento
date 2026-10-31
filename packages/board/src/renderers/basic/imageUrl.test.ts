import { describe, expect, it } from "vitest";
import { clampDimensions, resolveImageUrl } from "./imageUrl";

const base = "http://localhost:4000";

describe("resolveImageUrl", () => {
  it.each([
    ["/files/gen/colosseum.png", "http://localhost:4000/files/gen/colosseum.png"],
    ["files/x.png", "http://localhost:4000/files/x.png"],
    ["http://localhost:4000/files/x.png", "http://localhost:4000/files/x.png"],
  ])("accepts %s", (url, expected) => {
    expect(resolveImageUrl(url, base)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "https://evil.example/x.png",
    "//evil.example/x.png",
    "http://localhost:4001/x.png",
    "https://localhost:4000/x.png",
    "blob:http://localhost:4000/abc",
  ])("rejects %s", (url) => {
    expect(resolveImageUrl(url, base)).toBeNull();
  });

  it("rejects everything when the base is unknown", () => {
    expect(resolveImageUrl("/x.png", "")).toBeNull();
  });
});

describe("clampDimensions", () => {
  it("keeps sane sizes", () => {
    expect(clampDimensions({ w: 500, h: 400 })).toEqual({ w: 500, h: 400 });
  });
  it("caps each side at 2048 and the ratio at 4:1", () => {
    expect(clampDimensions({ w: 100_000, h: 100_000 })).toEqual({ w: 2048, h: 2048 });
    expect(clampDimensions({ w: 2000, h: 10 })).toEqual({ w: 40, h: 10 });
    expect(clampDimensions({ w: 100, h: 5000 })).toEqual({ w: 100, h: 400 });
  });
});
