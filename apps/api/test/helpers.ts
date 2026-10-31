import { MemoryChunkStore, MemoryExerciseListStore, MemoryRepository, MemorySubjectStore } from "@mento/db";
import { FileConversationSource, LAB_CONVERSATIONS_PATH, idMapsFromRepo, seedLabMaterial, seedStudents, type ExerciseGenerator } from "@mento/analysis";
import type { ConversationSource } from "@mento/contracts";
import { MemoryFileStore, fakeEmbed } from "@mento/sources";
import { InMemoryTurnRepository } from "@mento/tutor/testing";
import type { Embed } from "@mento/sources";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";

/** Stands in for Claude in tests: a valid list of 3 choice + 2 open questions, and the source it was given. */
export function fakeExerciseGenerator(): ExerciseGenerator & { sources: Parameters<ExerciseGenerator["generate"]>[0][] } {
  const sources: Parameters<ExerciseGenerator["generate"]>[0][] = [];
  const choice = (n: number) => ({ kind: "choice" as const, prompt: `Pergunta ${n}?`, options: ["A", "B", "C", "D"], answer: "B", explanation: "Porque sim (página 20).", page: 20 });
  const open = (n: number) => ({ kind: "open" as const, prompt: `Explique ${n}.`, options: null, answer: "Uma resposta.", explanation: "Explicação.", page: null });
  return {
    model: "fake-model",
    sources,
    async generate(source) {
      sources.push(source);
      return { title: `Lista sobre ${source.concept}`, questions: [choice(1), choice(2), choice(3), open(4), open(5)] };
    },
  };
}

export async function makeApp(
  options: { uploadMaxMb?: number; analyzeAll?: boolean; embed?: Embed | null; dbReady?: boolean; conversations?: ConversationSource; analysisMaxWaitMs?: number; exerciseGenerator?: ExerciseGenerator | null } = {},
) {
  const config = loadConfig({ LOG_LEVEL: "silent", ANALYSIS_MAX_WAIT_MS: String(options.analysisMaxWaitMs ?? 0), ...(options.uploadMaxMb ? { UPLOAD_MAX_MB: String(options.uploadMaxMb) } : {}) } as NodeJS.ProcessEnv);
  let t = Date.parse("2026-11-01T00:00:00Z");
  const repo = new MemoryRepository({ now: () => new Date((t += 1000)).toISOString() });
  const students = await seedStudents(repo);
  await seedLabMaterial(repo);
  const store = new MemoryFileStore();
  // The whiteboard side, in memory: subjects, the passage store (`chunks`) and the Voyage stand-in.
  const subjects = new MemorySubjectStore(repo);
  const history = await subjects.create({ name: "História", key: "history" });
  const chunkStore = new MemoryChunkStore(repo);
  const app = await buildApp(config, {
    teacherRepo: repo,
    // The API reads the conversations from MongoDB; these tests use the lab conversations (or the ones they pass).
    conversations: options.conversations ?? new FileConversationSource(LAB_CONVERSATIONS_PATH, idMapsFromRepo(repo)),
    repo: new InMemoryTurnRepository(), // the whiteboard's session repository (MongoDB in production)
    fileStore: store,
    retryDelayMs: 10,
    subjects,
    chunkStore,
    embed: "embed" in options ? options.embed : fakeEmbed(32),
    dbReady: () => options.dbReady ?? true,
    exerciseLists: new MemoryExerciseListStore(),
    exerciseGenerator: "exerciseGenerator" in options ? options.exerciseGenerator : fakeExerciseGenerator(),
  });
  if (options.analyzeAll) {
    for (const s of await app.container.conversations.listAllSessions()) await app.container.analysis.run(s.id);
  }
  const studentId = (fixture: string) => students.find((s) => s.fixture_id === fixture)!.id;
  return { app, repo, store, students, studentId, subjects, history, chunkStore };
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
