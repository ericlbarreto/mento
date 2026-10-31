// `pnpm fixtures:check`: every fixture parses with the Zod schemas from @mento/contracts.
// Whiteboard turn fixtures (Person 3) and the teacher fixtures (Person 1: students, class context, lab material, conversations).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ClassContext, ConversationFile, DiagramArgs, DiagramBase, FixtureTurn, Lesson, StudentInput } from "@mento/contracts";

let failed = false;

// ---- Whiteboard turn fixtures ----
const dir = join(import.meta.dirname, "..", "fixtures", "turns");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error(`fixtures:check: no fixtures found in ${dir}`);
  process.exit(1);
}
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

// ---- Diagram examples (draw_diagram model input → resolved args) ----
const diagrams = JSON.parse(readFileSync(join(dir, "..", "diagrams", "examples.json"), "utf8")) as { examples: { name: string; input: unknown; output: unknown }[] };
for (const ex of diagrams.examples) {
  const issues = [
    ...(DiagramBase.safeParse(ex.input).error?.issues.map((i) => `input.${i.path.join(".")}: ${i.message}`) ?? []),
    ...(DiagramArgs.safeParse(ex.output).error?.issues.map((i) => `output.${i.path.join(".")}: ${i.message}`) ?? []),
  ];
  if (issues.length === 0) console.log(`ok   diagrams/${ex.name}`);
  else {
    failed = true;
    console.error(`FAIL diagrams/${ex.name}`);
    for (const issue of issues) console.error(`     ${issue}`);
  }
}

// ---- Teacher fixtures ----
const read = (rel: string) => JSON.parse(readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), "utf8"));
const check = (name: string, run: () => string) => {
  try {
    console.log(`ok   ${name}: ${run()}`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${name}:`, err instanceof z.ZodError ? JSON.stringify(err.issues.slice(0, 3)) : err);
  }
};

check("seed/students.json", () => `${z.object({ students: z.array(StudentInput) }).parse(read("seed/students.json")).students.length} students`);
check("seed/class-context.json", () => ClassContext.parse(read("seed/class-context.json")).grade_level);
check("analysis-lab/material.json", () => `${z.object({ sequence: z.array(Lesson) }).parse(read("analysis-lab/material.json")).sequence.length} lessons`);
check("analysis-lab/conversations.json", () => {
  const { sessions } = ConversationFile.parse(read("analysis-lab/conversations.json"));
  for (const s of sessions) {
    const seqs = s.events.map((e) => e.seq);
    if (seqs.some((q, i) => q !== i + 1)) throw new Error(`${s.id}: event seq must be 1..n in order`);
    if (s.events[0]?.type !== "session_started" || s.events.at(-1)?.type !== "session_ended") throw new Error(`${s.id}: must start with session_started and end with session_ended`);
    for (const ev of s.evidence) {
      const recorded = s.events.some((e) => e.type === "evidence_recorded" && e.payload.evidence_id === ev.id);
      if (!recorded) throw new Error(`${s.id}: evidence ${ev.id} has no evidence_recorded event`);
    }
  }
  return `${sessions.length} sessions, ${sessions.reduce((a, s) => a + s.events.length, 0)} events`;
});

process.exit(failed ? 1 : 0);
