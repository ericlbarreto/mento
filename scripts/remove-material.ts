// Plan E: remove one material and its passages (chunks) from the database the ingestion uses (MONGODB_URI in .env).
// Dry run by default: prints the material and how many passages it has. With --apply it first writes a JSON backup
// (material + passages with embeddings) to materials/backups/, then deletes the passages and the material.
// Never touches subjects, sessions or evidence (old lessons keep their stored citations).
// Usage: pnpm materials:remove --id=<materialId> [--apply]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ChunkModel, connectMongo, disconnectMongo, MaterialModel } from "@mento/db";
import { backupFileName } from "./lib/book";

process.loadEnvFile(new URL("../.env", import.meta.url));
const id = process.argv.find((a) => a.startsWith("--id="))?.slice(5);
const apply = process.argv.includes("--apply");
if (!id || !/^[a-f0-9]{24}$/i.test(id)) {
  console.error("usage: pnpm materials:remove --id=<materialId> [--apply]");
  process.exit(1);
}
const { MONGODB_URI } = process.env;
if (!MONGODB_URI) throw new Error("MONGODB_URI is not set in .env");

await connectMongo(MONGODB_URI);
try {
  const material = await MaterialModel.findById(id).lean();
  if (!material) {
    console.error(`no material with id ${id}`);
    process.exitCode = 1;
  } else {
    const chunks = await ChunkModel.countDocuments({ material_id: id });
    const m = material as Record<string, unknown>;
    console.log(`material ${id}: "${m.title}" · subject ${m.subject} (${m.subject_id ?? "no subject_id"}) · ${m.pages} pages · status ${m.status}`);
    console.log(`passages (chunks): ${chunks}${m.file ? " · has an uploaded file (left on the file store)" : ""}`);
    if (!apply) console.log("dry run: nothing deleted. Re-run with --apply to back up and delete.");
    else {
      const passages = await ChunkModel.find({ material_id: id }).select("+embedding").lean();
      const dir = fileURLToPath(new URL("../materials/backups/", import.meta.url));
      mkdirSync(dir, { recursive: true });
      const backup = join(dir, backupFileName(id, new Date()));
      writeFileSync(backup, JSON.stringify({ material, chunks: passages }));
      if (passages.length !== chunks) throw new Error(`backup has ${passages.length} passages, expected ${chunks}: nothing deleted`);
      console.log(`backup: ${backup}`);
      const removedChunks = await ChunkModel.deleteMany({ material_id: id });
      const removedMaterial = await MaterialModel.deleteOne({ _id: id });
      console.log(`deleted ${removedChunks.deletedCount} passage(s) and ${removedMaterial.deletedCount} material`);
    }
  }
} finally {
  await disconnectMongo();
}
