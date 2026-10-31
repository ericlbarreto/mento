// Seeds one real session per subject whose whiteboard is one of the demo boards (fixtures/turns/demo-board*.json), so
// opening /session/<id> restores a rich board: image, chart/diagram, circles, highlights and cited sources.
// Creates each session through the API (POST /api/sessions), then stores the board as the session's events
// (user_message + tutor_action + turn_timing), the same events a live turn writes. Images: the PNGs in
// fixtures/images/demo are copied into the API image cache (DATA_DIR/files/gen) and served by GET /api/gen/:file.
// Usage: pnpm tsx scripts/seed-board-sessions.ts [--student=<id>] [--api=http://localhost:4000]
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FixtureTurn, type StreamMessage } from "@mento/contracts";
import { connectMongo, disconnectMongo, MongoTurnRepository } from "@mento/db";

process.loadEnvFile(new URL("../.env", import.meta.url));
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const API = arg("api") ?? "http://localhost:4000";
const { MONGODB_URI } = process.env;
if (!MONGODB_URI) throw new Error("MONGODB_URI is not set in .env");
const root = fileURLToPath(new URL("..", import.meta.url));
const genDir = join(process.env.DATA_DIR ?? join(root, "data"), "files", "gen");

const BOARDS = [
  { fixture: "demo-board-biology", subject: "biology", question: "Me explica o sistema endócrino? Mostra as glândulas no quadro e como os hormônios funcionam." },
  { fixture: "demo-board-history", subject: "history", question: "Me explica a Independência do Brasil com uma linha do tempo e uma imagem no quadro?" },
  { fixture: "demo-board-math", subject: "math", question: "Como eu calculo o preço de uma corrida de aplicativo? Mostra a conta e o gráfico no quadro." },
  { fixture: "demo-board", subject: "physics", question: "Me explica energia potencial e cinética numa montanha-russa, com desenho e gráfico?" },
];

const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${API}/api${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
};

/** /demo/<name>.svg (the web playground's URL) → /api/gen/<key>.png, copying the PNG into the API image cache. */
const servedImage = (url: string): string => {
  const name = url.replace(/^\/demo\//, "").replace(/\.svg$/, "");
  const key = createHash("md5").update(`demo-board:${name}`).digest("hex");
  mkdirSync(genDir, { recursive: true });
  copyFileSync(join(root, "fixtures/images/demo", `${name}.png`), join(genDir, `${key}.png`));
  return `/api/gen/${key}.png`;
};

const students = await api<{ id: string; name: string }[]>("/students");
const studentId = arg("student") ?? students.find((s) => s.name.startsWith("Ana"))?.id ?? students[0]?.id;
if (!studentId) throw new Error("no student to seed for");
const { subjects } = await api<{ subjects: { id: string; key: string }[] }>("/subjects");

await connectMongo(MONGODB_URI);
const repo = new MongoTurnRepository();
try {
  for (const board of BOARDS) {
    const subject = subjects.find((s) => s.key === board.subject);
    if (!subject) {
      console.warn(`skip ${board.fixture}: no subject with key ${board.subject}`);
      continue;
    }
    const turn = FixtureTurn.parse(JSON.parse(readFileSync(join(root, "fixtures/turns", `${board.fixture}.json`), "utf8")));
    const { id } = await api<{ id: string }>("/sessions", {
      method: "POST",
      body: JSON.stringify({ student_id: studentId, modality: "text", subject_id: subject.id }),
    });
    await repo.appendEvent(id, { type: "user_message", payload: { kind: "chat", text: board.question } });
    const turnId = "turn_1";
    for (const { message } of turn.messages as { message: StreamMessage }[]) {
      if (message.type !== "action") continue;
      const { action, order } = message;
      const args = action.name === "draw_result" ? { ...action.args, url: servedImage(action.args.url) } : action.args;
      await repo.appendEvent(id, { type: "tutor_action", payload: { turn_id: turnId, action_id: `${turnId}_${action.id}`, order, name: action.name, args } });
      if (action.name === "ask_verification") {
        const { verification_id, id: element_id, concept, concept_key, question, kind } = action.args;
        await repo.appendEvent(id, { type: "verification_asked", payload: { verification_id, element_id, concept, concept_key, question, kind } });
      }
    }
    await repo.appendEvent(id, { type: "turn_timing", payload: { turn_id: turnId, first_action_ms: 900, last_action_ms: 4200 } });
    console.log(`${board.subject}: http://localhost:3000/session/${id}`);
  }
} finally {
  await disconnectMongo();
}
