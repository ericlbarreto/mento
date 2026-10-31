import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Ana Beatriz Souza")).toBe("AS");
    expect(initials("maya pereira")).toBe("MP");
  });
  it("keeps one letter for a single name and handles accents and extra spaces", () => {
    expect(initials("  Ícaro  ")).toBe("Í");
    expect(initials("Élise   Ávila")).toBe("ÉÁ");
  });
  it("falls back to ? when the name is empty", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
