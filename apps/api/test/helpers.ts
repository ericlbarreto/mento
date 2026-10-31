import { MemoryRepository } from "@mento/db";
import { seedLabMaterial, seedStudents } from "@mento/analysis";
import { MemoryFileStore } from "@mento/sources";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";

export async function makeApp(options: { uploadMaxMb?: number; analyzeAll?: boolean } = {}) {
  const config = loadConfig({ LOG_LEVEL: "silent", ...(options.uploadMaxMb ? { UPLOAD_MAX_MB: String(options.uploadMaxMb) } : {}) } as NodeJS.ProcessEnv);
  let t = Date.parse("2026-11-01T00:00:00Z");
  const repo = new MemoryRepository({ now: () => new Date((t += 1000)).toISOString() });
  const students = await seedStudents(repo);
  await seedLabMaterial(repo);
  const store = new MemoryFileStore();
  const app = await buildApp(config, { teacherRepo: repo, fileStore: store, retryDelayMs: 10 });
  if (options.analyzeAll) {
    for (const s of await app.container.conversations.listAllSessions()) await app.container.analysis.run(s.id);
  }
  const studentId = (fixture: string) => students.find((s) => s.fixture_id === fixture)!.id;
  return { app, repo, store, students, studentId };
}

export function multipart(fields: Record<string, string>, file?: { name: string; data: Buffer; type?: string }) {
  const boundary = "----mentoTestBoundary";
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (file) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type ?? "application/pdf"}\r\n\r\n`), file.data, Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}
