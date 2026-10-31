import { describe, expect, it } from "vitest";
import { requestParams, toLlmError } from "./anthropic-llm";

describe("toLlmError", () => {
  it("marks rate limits, overload and server errors as retryable and client errors as not", () => {
    expect(toLlmError(Object.assign(new Error("rate"), { status: 429 })).retryable).toBe(true);
    expect(toLlmError(Object.assign(new Error("overloaded"), { status: 529 })).retryable).toBe(true);
    expect(toLlmError(Object.assign(new Error("boom"), { status: 500 })).retryable).toBe(true);
    expect(toLlmError(Object.assign(new Error("bad"), { status: 400 })).retryable).toBe(false);
    expect(toLlmError(new Error("network")).retryable).toBe(false);
  });
});

describe("requestParams", () => {
  const base = { model: "m", system: [], tools: [], messages: [{ role: "user" as const, content: "x" }], max_tokens: 10 };

  it("omits tool_choice by default and forwards a forced tool", () => {
    expect("tool_choice" in requestParams(base)).toBe(false);
    expect(requestParams({ ...base, tool_choice: { type: "tool", name: "record_judgment" } }).tool_choice).toEqual({ type: "tool", name: "record_judgment" });
  });
});
