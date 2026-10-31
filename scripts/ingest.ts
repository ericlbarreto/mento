import { readFileSync } from "node:fs";
import { connectMongo, deleteMaterialsByTitle, disconnectMongo, ensureChunkIndexes, MongoChunkStore } from "@mento/db";
import { embedWithVoyage } from "@mento/sources";
import { ingestPdf, parseChapters } from "@mento/sources/ingest";

process.loadEnvFile(new URL("../.env", import.meta.url));
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const title = arg("title");
const subject = arg("subject");
if (!file || !title || !subject) {
  console.error('usage: pnpm ingest <file.pdf> --title="História de Roma" --subject=history [--chapters="A República:1-40;O Império:41-90"] [--replace]');
  process.exit(1);
}
const { MONGODB_URI, VOYAGE_API_KEY } = process.env;
if (!MONGODB_URI) throw new Error("MONGODB_URI is not set in .env");
if (!VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY is not set in .env");

await connectMongo(MONGODB_URI);
try {
  const created = await ensureChunkIndexes();
  if (created.length) console.log(`created search indexes: ${created.join(", ")} (Atlas builds them in the background; searches work once they are queryable)`);
  if (process.argv.includes("--replace")) {
    const removed = await deleteMaterialsByTitle(title);
    console.log(`--replace: removed ${removed.materials} earlier material(s) titled "${title}" and ${removed.chunks} passage(s)`);
  }
  const report = await ingestPdf({
    data: readFileSync(file),
    title,
    subject,
    chapters: arg("chapters") ? parseChapters(arg("chapters") as string) : [],
    store: new MongoChunkStore(),
    embed: embedWithVoyage({ apiKey: VOYAGE_API_KEY }),
    log: (m) => console.log(m),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.empty_pages.length) console.log(`WARNING: ${report.empty_pages.length} page(s) have no text layer and are not searchable (they need OCR).`);
} finally {
  await disconnectMongo();
}
