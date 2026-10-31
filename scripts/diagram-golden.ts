// `pnpm diagrams:golden`: re-resolves every example in fixtures/diagrams/examples.json and writes its `output`
// (the resolved draw_diagram args). Review the diff and the /dev/diagrams gallery before committing.
// packages/tutor/src/diagram/resolve.test.ts fails while an output is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { resolveDiagram } from "@mento/tutor";

const file = new URL("../fixtures/diagrams/examples.json", import.meta.url);
const data = JSON.parse(readFileSync(file, "utf8")) as { description: string; examples: { name: string; input: unknown; output?: unknown }[] };
for (const ex of data.examples) {
  const { args, notes, reason } = resolveDiagram(ex.input);
  if (!args) throw new Error(`${ex.name}: ${reason}`);
  ex.output = args;
  console.log(`ok   ${ex.name} (${args.shapes.length} shapes)${notes.length ? ` notes: ${notes.join("; ")}` : ""}`);
}
writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
