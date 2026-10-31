import { fileURLToPath } from "node:url";
import { Action } from "@mento/contracts";
import { AnthropicLlm, buildSystem, buildUserMessage, loadPromptsSync, modelTools } from "@mento/tutor";

process.loadEnvFile(new URL("../.env", import.meta.url));
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env");
const model = process.env.TUTOR_MODEL ?? "claude-sonnet-5-5";

const prompts = loadPromptsSync(fileURLToPath(new URL("../prompts", import.meta.url)));
const system = buildSystem({
  prompts,
  classContext: { grade_level: "8º ano", description: "Turma participativa, gosta de exemplos do cotidiano." },
  summary: { open_gaps: [{ concept: "Fim da República", concept_key: "fim da republica", description: "Confunde República e Império", confidence: 0.6 }], recent_progress: [] },
  catalog: [{ material_id: "demo-roma", title: "História de Roma (demo)", subject: "history", chapters: ["A República", "O Império"] }],
});
const tools = modelTools();
const llm = new AnthropicLlm({ apiKey });

const scenarios = [
  { name: "opening", user: buildUserMessage({ modality: "voice", history: [], boardSnapshot: "(the board is empty)", passages: [], appended: [] }) },
  {
    name: "question",
    user: buildUserMessage({
      modality: "voice", history: [], boardSnapshot: "(the board is empty)",
      passages: [{ id: "c1", material_id: "demo-roma", subject: "history", chapter: "O Império", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto, e Roma passou a ser governada por um imperador." }],
      appended: [{ name: "user_message", kind: "speech", text: "Quem foi Augusto e por que ele é importante?" }],
    }),
  },
];

console.log(`model: ${model}; tools: ${tools.length}`);
await llm.prewarm?.({ model, system, tools, messages: [{ role: "user", content: "." }] }).then(
  () => console.log("prewarm: ok"),
  (e) => console.log(`prewarm: failed (${(e as Error).message})`),
);

for (const s of scenarios) {
  for (let run = 1; run <= 3; run++) {
    const t0 = performance.now();
    let firstToken = 0;
    let firstBlock = 0;
    let blocks = 0;
    let valid = 0;
    let usage = "";
    for await (const ev of llm.stream({ model, system, tools, messages: [{ role: "user", content: s.user }], max_tokens: 2048 })) {
      if (ev.type === "first_token" && !firstToken) firstToken = performance.now() - t0;
      if (ev.type === "tool_block") {
        if (!firstBlock) firstBlock = performance.now() - t0;
        blocks++;
        try {
          const args = JSON.parse(ev.block.raw_input);
          if (ev.block.name === "search_materials" || Action.safeParse({ id: "x", name: ev.block.name, args: ev.block.name === "ask_verification" ? { ...args, verification_id: "v", concept_key: "k" } : args }).success) valid++;
        } catch {
          /* counted as invalid */
        }
      }
      if (ev.type === "stop") usage = JSON.stringify(ev.usage ?? {});
    }
    console.log(`${s.name} #${run}: first token ${firstToken.toFixed(0)} ms, first tool block ${firstBlock.toFixed(0)} ms, total ${(performance.now() - t0).toFixed(0)} ms, ${valid}/${blocks} valid blocks, usage ${usage}`);
  }
}
