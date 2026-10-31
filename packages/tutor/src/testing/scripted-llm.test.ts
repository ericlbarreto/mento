import { describe, expect, it } from "vitest";
import { LlmError, type LlmRequest } from "../llm";
import { ScriptedLlm, stopEvent, toolEvent } from "./scripted-llm";

const request = (signal?: AbortSignal): LlmRequest => ({ model: "m", system: [], tools: [], messages: [{ role: "user", content: "x" }], max_tokens: 10, signal });

async function collect(llm: ScriptedLlm, signal?: AbortSignal) {
  const out = [];
  for await (const ev of llm.stream(request(signal))) out.push(ev);
  return out;
}

describe("ScriptedLlm", () => {
  it("plays one scripted round per call, repeats the last round, and records the requests", async () => {
    const llm = new ScriptedLlm([[toolEvent("speak", { text: "um" }), stopEvent()], [toolEvent("speak", { text: "dois" }), stopEvent()]]);
    const first = await collect(llm);
    const second = await collect(llm);
    const third = await collect(llm);
    expect(first[0]).toMatchObject({ type: "tool_block", block: { name: "speak" } });
    expect(JSON.parse((second[0] as { block: { raw_input: string } }).block.raw_input)).toEqual({ text: "dois" });
    expect(JSON.parse((third[0] as { block: { raw_input: string } }).block.raw_input)).toEqual({ text: "dois" });
    expect(llm.calls).toHaveLength(3);
  });

  it("can fail the first call, and stops when the signal aborts", async () => {
    const failing = new ScriptedLlm([[stopEvent()]], { failFirst: new LlmError("overloaded", 529, true) });
    await expect(collect(failing)).rejects.toMatchObject({ retryable: true });
    expect(await collect(failing)).toEqual([{ type: "stop", stop_reason: "end_turn" }]);

    const controller = new AbortController();
    controller.abort();
    expect(await collect(new ScriptedLlm([[toolEvent("speak", { text: "x" })]]), controller.signal)).toEqual([]);
  });
});
