import { describe, expect, it } from "vitest";
import { ToolBlockAssembler, type RawStreamEvent } from "./tool-assembler";

const start = (index: number, id: string, name: string): RawStreamEvent => ({ type: "content_block_start", index, content_block: { type: "tool_use", id, name } });
const delta = (index: number, partial_json: string): RawStreamEvent => ({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json } });
const stop = (index: number): RawStreamEvent => ({ type: "content_block_stop", index });

function run(events: RawStreamEvent[]) {
  const asm = new ToolBlockAssembler();
  return events.flatMap((e) => asm.push(e));
}

describe("ToolBlockAssembler", () => {
  it("joins partial JSON fragments and emits a block only when it closes", () => {
    const asm = new ToolBlockAssembler();
    expect(asm.push(start(0, "toolu_1", "speak"))).toEqual([]);
    expect(asm.push(delta(0, '{"text": "Ol'))).toEqual([]);
    expect(asm.push(delta(0, 'á!"}'))).toEqual([]);
    expect(asm.push(stop(0))).toEqual([{ id: "toolu_1", name: "speak", raw_input: '{"text": "Olá!"}' }]);
  });

  it("ignores text blocks and keeps several tool blocks in order", () => {
    const blocks = run([
      { type: "content_block_start", index: 0, content_block: { type: "text" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta" } },
      stop(0),
      start(1, "t1", "write_text"), delta(1, '{"id":"title"'), delta(1, ',"column":"main","html":"<h1>x</h1>"}'), stop(1),
      start(2, "t2", "speak"), delta(2, '{"text":"oi"}'), stop(2),
    ]);
    expect(blocks.map((b) => b.name)).toEqual(["write_text", "speak"]);
    expect(JSON.parse(blocks[0]!.raw_input)).toEqual({ id: "title", column: "main", html: "<h1>x</h1>" });
  });

  it("uses an empty object for a tool call without arguments and passes truncated JSON through unparsed", () => {
    expect(run([start(0, "t", "remove_element"), stop(0)])[0]?.raw_input).toBe("{}");
    const cut = run([start(0, "t", "speak"), delta(0, '{"text": "inter'), stop(0)])[0];
    expect(() => JSON.parse(cut!.raw_input)).toThrow();
  });
});
