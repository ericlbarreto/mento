import { describe, expect, it } from "vitest";
import { toLlmError } from "./anthropic-llm";

describe("toLlmError", () => {
  it("marks rate limits, overload and server errors as retryable and client errors as not", () => {
    expect(toLlmError(Object.assign(new Error("rate"), { status: 429 })).retryable).toBe(true);
    expect(toLlmError(Object.assign(new Error("overloaded"), { status: 529 })).retryable).toBe(true);
    expect(toLlmError(Object.assign(new Error("boom"), { status: 500 })).retryable).toBe(true);
    expect(toLlmError(Object.assign(new Error("bad"), { status: 400 })).retryable).toBe(false);
    expect(toLlmError(new Error("network")).retryable).toBe(false);
  });
});
