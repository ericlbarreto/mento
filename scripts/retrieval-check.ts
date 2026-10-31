import { readFileSync } from "node:fs";
import { connectMongo, disconnectMongo, MongoChunkStore } from "@mento/db";
import { createRetriever, embedWithVoyage } from "@mento/sources";

process.loadEnvFile(new URL("../.env", import.meta.url));
const { MONGODB_URI, VOYAGE_API_KEY } = process.env;
if (!MONGODB_URI || !VOYAGE_API_KEY) throw new Error("MONGODB_URI and VOYAGE_API_KEY must be set in .env");

const { questions } = JSON.parse(readFileSync(new URL("../fixtures/retrieval/questions.json", import.meta.url), "utf8")) as {
  questions: { question: string; expect_page: number | null }[];
};
const p50 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : NaN);

await connectMongo(MONGODB_URI);
try {
  const embedTimes: number[] = [];
  const base = embedWithVoyage({ apiKey: VOYAGE_API_KEY });
  const embed: typeof base = async (texts, type) => {
    const t0 = performance.now();
    const out = await base(texts, type);
    if (type === "query") embedTimes.push(performance.now() - t0);
    return out;
  };
  const retriever = createRetriever({ store: new MongoChunkStore(), embed, log: (m, e) => console.log("  !", m, e) });

  const totals: number[] = [];
  let judged = 0;
  let hits = 0;
  for (const { question, expect_page } of questions) {
    const t0 = performance.now();
    const chunks = await retriever.searchChunks({ query: question, k: 3 });
    const ms = performance.now() - t0;
    totals.push(ms);
    const pages = chunks.map((c) => c.page);
    const verdict = expect_page === null ? "" : pages.includes(expect_page) ? "  HIT" : "  MISS";
    if (expect_page !== null) {
      judged++;
      if (pages.includes(expect_page)) hits++;
    }
    console.log(`\n${question}  (${ms.toFixed(0)} ms)${verdict}`);
    for (const c of chunks) console.log(`  p.${c.page}${c.chapter ? ` · ${c.chapter}` : ""} · ${c.text.slice(0, 90).replace(/\s+/g, " ")}…`);
  }
  console.log(`\nsearch (embed + vector + text + fusion): p50 ${p50(totals).toFixed(0)} ms; query embedding alone: p50 ${p50(embedTimes).toFixed(0)} ms`);
  if (judged) console.log(`hit@3: ${hits}/${judged}`);
} finally {
  await disconnectMongo();
}
