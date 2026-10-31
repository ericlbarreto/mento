// Owner: Person 1. `pnpm test:rules`: runs every test once and prints a table: business rule → tests → result.
// Fails when a test fails or when a rule has no test at all. Tests name their rule: it("BR-05 …").
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RULES: Record<string, string> = {
  "BR-01": "Severity rules R1, R3, M1, M2, P1, P2, P3",
  "BR-02": "Rule precedence: the first match wins",
  "BR-03": "A short session generates nothing",
  "BR-04": "Confidence is a formula with a clamp",
  "BR-05": "Diagnosis by the prerequisite graph",
  "BR-06": "The LLM cannot change the verdict",
  "BR-07": "Quotes are real (verbatim student text)",
  "BR-08": "Every finding becomes an insight; every gap has a suggestion",
  "BR-09": "Determinism: same input, same output, no repeated LLM call",
  "BR-10": "A gap is updated, never duplicated",
  "BR-11": "Resolution: P2 closes the gap and adds progress",
  "BR-12": "The teacher's decision is final (dismissed stays dismissed)",
  "BR-13": "One suggestion per open gap",
  "BR-14": "Privacy: no name, profile or school history reaches the model",
  "BR-15": "No sensitive inferences about the student",
  "BR-16": "Analysis lifecycle: pending, running, done/failed, one retry",
  "BR-17": "Golden scenario: the 8 lab conversations",
  "BR-18": "Overview metrics match a recount",
  "BR-19": "Student views: profile, history, insights table, evolution",
  "BR-20": "Seeds are idempotent and reset only teacher collections",
  "BR-21": "Upload of a PDF for a subject: validation (400, 404, 413, 415, 503), duplicate",
  "BR-22": "Ingestion status: extracting, embedding, ready/failed, recovery without duplicates",
  "BR-23": "Embedded passages for the tutor's retriever and citation validation",
  "BR-24": "Chapters and lesson sequence extraction and fallback",
  "BR-25": "The uploaded material reaches the whiteboard: hidden while processing, then in the subject, catalog and search",
  "BR-26": "Fixtures stay out of the tutor's way; whiteboard-ingested materials read fine",
};

const dir = mkdtempSync(join(tmpdir(), "mento-rules-"));
const out = join(dir, "report.json");
const run = spawnSync("pnpm", ["exec", "vitest", "run", "--reporter=json", `--outputFile=${out}`], { stdio: ["ignore", "ignore", "inherit"], env: process.env });

let report: { testResults: { assertionResults: { fullName: string; title: string; status: string }[] }[] };
try {
  report = JSON.parse(readFileSync(out, "utf8"));
} catch {
  console.error("vitest produced no report (exit code " + run.status + ")");
  process.exit(1);
}

type Tally = { passed: number; failed: number; skipped: number };
const tally = new Map<string, Tally>(Object.keys(RULES).map((id) => [id, { passed: 0, failed: 0, skipped: 0 }]));
const unnamed: string[] = [];
let total = 0;
for (const file of report.testResults) {
  for (const t of file.assertionResults) {
    total += 1;
    const id = /BR-\d{2}/.exec(t.title)?.[0];
    const row = id ? tally.get(id) : undefined;
    if (!row) {
      if (t.status === "failed") unnamed.push(t.fullName);
      continue;
    }
    if (t.status === "passed") row.passed += 1;
    else if (t.status === "failed") row.failed += 1;
    else row.skipped += 1;
  }
}

let bad = 0;
console.log("\nrule   tests  pass  fail  skip  status      business rule");
for (const [id, description] of Object.entries(RULES)) {
  const r = tally.get(id)!;
  const n = r.passed + r.failed + r.skipped;
  const status = r.failed > 0 ? "FAILED" : r.passed === 0 ? "UNCOVERED" : r.skipped > 0 ? "ok (skips)" : "ok";
  if (r.failed > 0 || r.passed === 0) bad += 1;
  console.log(`${id}  ${String(n).padStart(5)}  ${String(r.passed).padStart(4)}  ${String(r.failed).padStart(4)}  ${String(r.skipped).padStart(4)}  ${status.padEnd(10)}  ${description}`);
}
for (const name of unnamed) {
  bad += 1;
  console.log(`FAILED (no rule id): ${name}`);
}
console.log(`\n${total} tests in total; ${Object.keys(RULES).length - bad} of ${Object.keys(RULES).length} rules green${bad ? `, ${bad} need attention` : ""}.`);
process.exit(bad === 0 && run.status === 0 ? 0 : 1);
