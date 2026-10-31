// Owner: Person 1. `pnpm db:stats [--db <name>]`: document counts per teacher collection.
import mongoose from "mongoose";
import { openRepo, parseArgs } from "./lib/db";

const args = parseArgs(process.argv.slice(2));
const { dbName, close } = await openRepo(args);
try {
  const db = mongoose.connection.db!;
  console.log(`database "${dbName}"`);
  for (const name of ["students", "classcontexts", "subjects", "materials", "chunks", "analyses", "insights"]) {
    console.log(`  ${name.padEnd(14)} ${await db.collection(name).countDocuments()}`);
  }
  const bySeverity = await db.collection("insights").aggregate([{ $group: { _id: { kind: "$kind", severity: "$severity", status: "$status" }, n: { $sum: 1 } } }]).toArray();
  for (const row of bySeverity.sort((a, b) => JSON.stringify(a._id).localeCompare(JSON.stringify(b._id)))) {
    console.log(`    ${row._id.kind}/${row._id.severity}/${row._id.status}: ${row.n}`);
  }
} finally {
  await close();
}
