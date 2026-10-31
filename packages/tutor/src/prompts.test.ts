import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPromptsSync } from "./prompts";

describe("loadPromptsSync", () => {
  it("reads the base prompt and every subject profile of the repository", () => {
    const set = loadPromptsSync(fileURLToPath(new URL("../../../prompts", import.meta.url)));
    expect(set.base).toContain("Brazilian Portuguese");
    expect(Object.keys(set.subjects).sort()).toEqual(["generic", "history"]);
    expect(set.subjects.history).toContain("Place every event in time");
  });
});
