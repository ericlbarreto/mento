import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig port", () => {
  it("defaults to 4000", () => {
    expect(loadConfig({}).API_PORT).toBe(4000);
  });

  it("uses PORT, which hosts such as Render set", () => {
    expect(loadConfig({ PORT: "10000" }).API_PORT).toBe(10000);
  });

  it("lets API_PORT win over PORT", () => {
    expect(loadConfig({ API_PORT: "4100", PORT: "10000" }).API_PORT).toBe(4100);
  });
});
