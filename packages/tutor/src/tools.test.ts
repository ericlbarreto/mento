import { describe, expect, it } from "vitest";
import { SearchMaterialsArgs, modelTools } from "./tools";

describe("modelTools", () => {
  const tools = modelTools();
  const byName = (n: string) => tools.find((t) => t.name === n);

  it("lists the tutor tools in a fixed order (prompt-cache stability)", () => {
    expect(tools.map((t) => t.name)).toEqual([
      "speak", "write_text", "write_timeline", "highlight", "circle_annotate",
      "draw", "draw_diagram", "update_element", "remove_element", "ask_verification", "search_materials",
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
    expect(JSON.stringify(byName("draw")?.input_schema)).not.toContain("is_structured");
  });

  it("gives draw_diagram the model-facing shapes (anchors and frames, not resolved geometry)", () => {
    const schema = JSON.stringify(byName("draw_diagram")?.input_schema);
    for (const word of ["frame", "magnitude", "x_range", "\"on\""]) expect(schema).toContain(word);
    expect(schema).not.toContain("x_axis");
    expect(schema).not.toContain("\"view\"");
    expect(byName("draw_diagram")?.description).toMatch(/Never compute arrow end points/);
  });

  it("turns on eager input streaming only for the large tools", () => {
    expect(tools.filter((t) => t.eager_input_streaming).map((t) => t.name)).toEqual(["write_text", "write_timeline", "draw", "draw_diagram"]);
  });

  it("validates search_materials arguments", () => {
    expect(SearchMaterialsArgs.safeParse({ query: "fim da república" }).success).toBe(true);
    expect(SearchMaterialsArgs.safeParse({ query: "x", k: 20 }).success).toBe(false);
  });
});
