import { describe, expect, it } from "vitest";
import { normalizeConcept } from "./concept";

describe("normalizeConcept", () => {
  it("lowercases, strips accents and punctuation, collapses spaces", () => {
    expect(normalizeConcept("  Queda da República — Roma!  ")).toBe("queda da republica roma");
  });
  it("is idempotent", () => {
    const once = normalizeConcept("Divisão de Poderes");
    expect(normalizeConcept(once)).toBe(once);
  });
});
