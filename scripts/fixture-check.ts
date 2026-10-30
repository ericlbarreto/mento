import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FixtureTurn } from "@mento/contracts";

const dir = join(import.meta.dirname, "..", "fixtures", "turns");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error(`fixtures:check: no fixtures found in ${dir}`);
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const result = FixtureTurn.safeParse(JSON.parse(readFileSync(join(dir, file), "utf8")));
  if (result.success) {
    console.log(`ok   ${file} (${result.data.messages.length} messages)`);
  } else {
    failed = true;
    console.error(`FAIL ${file}`);
    for (const issue of result.error.issues) console.error(`     ${issue.path.join(".")}: ${issue.message}`);
  }
}
process.exit(failed ? 1 : 0);
