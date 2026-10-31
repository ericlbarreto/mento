import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FixtureTurn, type StreamMessage } from "@mento/contracts";

const name = process.argv[2];
if (!name) {
  console.error("usage: pnpm turn <fixture-name>   (fixtures/turns/<name>.json)");
  process.exit(1);
}

const file = join(import.meta.dirname, "..", "fixtures", "turns", `${name}.json`);
const fixture = FixtureTurn.parse(JSON.parse(readFileSync(file, "utf8")));

function describe(m: StreamMessage): string {
  switch (m.type) {
    case "action": {
      const a = m.action;
      const detail = a.name === "speak" ? `"${a.args.text}"` : JSON.stringify(a.args).slice(0, 80);
      return `#${m.order} ${a.name} ${detail}`;
    }
    case "speech_alignment": return `alignment ${m.action_id}: ${m.words.map((w) => w.word).join(" ")}`;
    case "svg_chunk": return `svg_chunk ${m.element_id} (${m.chunk.length} chars)`;
    case "script_done": return `script_done ${m.turn_id}`;
    case "turn_done": return `turn_done ${m.turn_id} ${JSON.stringify(m.timing ?? {})}`;
    case "error": return `error ${m.code}: ${m.message} (recoverable: ${m.recoverable})`;
  }
}

console.log(fixture.description, "\n");
for (const { at_ms, message } of fixture.messages) {
  console.log(`+${String(at_ms).padStart(5)} ms  ${describe(message)}`);
}
