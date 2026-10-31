// Owner: Person 1. `pnpm seed:lab [--analyze] [--rebuild] [--db <name>]`
// Loads the lab material (metadata + lesson sequence; no PDF, so no chunks) into MongoDB.
// The lab CONVERSATIONS are not stored in MongoDB: they are read from fixtures/analysis-lab/conversations.json.
// `--analyze` runs the real analysis for every lab conversation in chronological order and stores
// only `analyses` and `insights`. `--rebuild` regenerates conversations.json from scripts.json first.
import { execFileSync } from "node:child_process";
import { AnalysisService, FileConversationSource, LAB_CONVERSATIONS_PATH, idMapsFromRepo, seedLabMaterial } from "@mento/analysis";
import { openRepo, parseArgs } from "./lib/db";

const args = parseArgs(process.argv.slice(2));
if (args.flags.has("rebuild")) execFileSync("pnpm", ["exec", "tsx", "fixtures/analysis-lab/build.ts"], { stdio: "inherit" });

const { repo, dbName, close } = await openRepo(args);
try {
  const material = await seedLabMaterial(repo);
  console.log(`seed:lab: material "${material.title}" (${material.sequence.length} lessons) in "${dbName}"`);

  const conversations = new FileConversationSource(LAB_CONVERSATIONS_PATH, idMapsFromRepo(repo));
  const sessions = await conversations.listAllSessions();
  if (sessions.length === 0) throw new Error("no lab conversation matches a seeded student: run `pnpm seed` first");
  console.log(`seed:lab: ${sessions.length} lab conversations available (read from the JSON file, not stored in MongoDB)`);

  if (args.flags.has("analyze")) {
    const service = new AnalysisService({ repo, conversations, log: (m, e) => console.error(m, e) });
    for (const s of sessions) {
      const { analysis, cached, insights } = await service.run(s.id);
      console.log(`  ${s.id}: ${analysis.status}${cached ? " (cached)" : ""}, ${insights.length} insights touched${analysis.skip_reason ? `, skipped (${analysis.skip_reason})` : ""}`);
    }
  }
} finally {
  await close();
}
