// Owner: Person 1. `pnpm seed [--reset] [--db <name>]`
// Loads the mocked students (profile, guardian, school history, current term) and the class context.
// Idempotent: students are upserted by fixture_id. `--reset` first clears ONLY the teacher-side collections
// (students, class context, materials, chunks, analyses, insights) of the selected database.
import { seedStudents } from "@mento/analysis";
import { openRepo, parseArgs } from "./lib/db";

const args = parseArgs(process.argv.slice(2));
const { repo, dbName, close } = await openRepo(args);
try {
  if (args.flags.has("reset")) {
    await repo.resetTeacherData();
    console.log(`reset: teacher collections cleared in database "${dbName}"`);
  }
  const students = await seedStudents(repo);
  console.log(`seed: ${students.length} students (${students.filter((s) => s.is_simulated).length} simulated) + class context in "${dbName}"`);
} finally {
  await close();
}
