/** The few fields of Anthropic stream events the assembler reads (kept structural so any SDK version fits). */
export interface RawStreamEvent {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string };
  delta?: { type: string; partial_json?: string };
}

/** A tool call whose input JSON is complete (`raw_input` may still be invalid JSON if the model was cut off). */
export interface ToolBlock {
  id: string;
  name: string;
  raw_input: string;
}

/** Accumulates `input_json_delta` fragments per content block and emits each tool call when its block stops. */
export class ToolBlockAssembler {
  private readonly open = new Map<number, { id: string; name: string; parts: string[] }>();

  push(event: RawStreamEvent): ToolBlock[] {
    const index = event.index;
    if (index === undefined) return [];
    if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
      this.open.set(index, { id: event.content_block.id ?? "", name: event.content_block.name ?? "", parts: [] });
      return [];
    }
    if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
      this.open.get(index)?.parts.push(event.delta.partial_json ?? "");
      return [];
    }
    if (event.type === "content_block_stop") {
      const block = this.open.get(index);
      if (!block) return [];
      this.open.delete(index);
      return [{ id: block.id, name: block.name, raw_input: block.parts.join("") || "{}" }];
    }
    return [];
  }
}
