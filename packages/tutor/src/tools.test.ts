import { describe, expect, it } from "vitest";
import { SearchMaterialsArgs, modelTools } from "./tools";

describe("modelTools", () => {
  const tools = modelTools();
  const byName = (n: string) => tools.find((t) => t.name === n);

  it("lists the tutor tools in a fixed order (prompt-cache stability)", () => {
    expect(tools.map((t) => t.name)).toEqual([
      "speak", "write_text", "write_timeline", "highlight", "circle_annotate",
      "draw", "update_element", "remove_element", "ask_verification", "search_materials",
    ]);
    expect(JSON.stringify(modelTools())).toBe(JSON.stringify(tools));
  });

  it("gives every tool an object schema and a description", () => {
    for (const t of tools) {
      expect(t.input_schema.type).toBe("object");
      expect(t.description.length).toBeGreaterThan(40);
    }
  });

  it("hides server-filled fields from the model", () => {
    const speak = JSON.stringify(byName("speak")?.input_schema);
    expect(speak).not.toContain("audio_url");
    const ask = JSON.stringify(byName("ask_verification")?.input_schema);
    expect(ask).not.toContain("verification_id");
    expect(ask).not.toContain("concept_key");
    expect(JSON.stringify(tools)).not.toContain("draw_result");
  });

  it("turns on eager input streaming only for the large tools", () => {
    expect(tools.filter((t) => t.eager_input_streaming).map((t) => t.name)).toEqual(["write_text", "write_timeline", "draw"]);
  });

  it("validates search_materials arguments", () => {
    expect(SearchMaterialsArgs.safeParse({ query: "fim da república" }).success).toBe(true);
    expect(SearchMaterialsArgs.safeParse({ query: "x", k: 20 }).success).toBe(false);
  });
});
