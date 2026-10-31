import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GeminiImageClient, IMAGE_STYLE, ImageStore } from "@mento/tutor";

process.loadEnvFile(new URL("../.env", import.meta.url));
const arg = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const model = arg("model", process.env.IMAGE_MODEL ?? "gemini-3.1-flash-lite-image");
const rounds = Number(arg("rounds", "1"));
const only = arg("only", "");
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env");

const { prompts } = JSON.parse(readFileSync(new URL("../fixtures/images/rome.json", import.meta.url), "utf8")) as { prompts: { name: string; prompt: string }[] };
const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL("../data", import.meta.url));
const store = new ImageStore(`${dataDir}/files/gen`);
const compareStore = new ImageStore(`${dataDir}/files/gen-compare/${model}`);
const client = new GeminiImageClient({ apiKey, model });

console.log(`model: ${model}, rounds: ${rounds}`);
const times: number[] = [];
for (const { name, prompt } of prompts.filter((p) => !only || p.name === only)) {
  for (let round = 1; round <= rounds; round++) {
    const full = `${prompt}. ${IMAGE_STYLE}`;
    const t0 = performance.now();
    try {
      const image = await client.generate({ prompt: full });
      const ms = performance.now() - t0;
      times.push(ms);
      // Round 1 seeds the real cache (same key the pipeline uses); every round is kept for the visual comparison.
      if (round === 1) await store.put(store.key({ prompt, style: IMAGE_STYLE, model }), image);
      await compareStore.put(`${name}-r${round}`.padEnd(32, "0").slice(0, 32), image);
      console.log(`${name} r${round}: ${ms.toFixed(0)} ms, ${(image.bytes.length / 1024).toFixed(0)} KB, ${image.mime_type}`);
    } catch (err) {
      console.log(`${name} r${round}: FAILED ${(err as Error).message}`);
    }
  }
}
if (times.length) {
  const sorted = [...times].sort((a, b) => a - b);
  console.log(`\n${times.length} images, p50 ${sorted[Math.floor(sorted.length / 2)]!.toFixed(0)} ms, max ${sorted.at(-1)!.toFixed(0)} ms, estimated cost $${(times.length * 0.0336).toFixed(2)}`);
  console.log(`Seeded cache: ${dataDir}/files/gen · comparison copies: ${dataDir}/files/gen-compare/${model}`);
}
