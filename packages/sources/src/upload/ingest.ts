import type { ChunkStore, Material, TeacherRepository } from "@mento/contracts";
import { cleanPageText } from "../clean";
import { ingestPdf } from "../ingest";
import { extractPdfPages } from "../pdf";
import type { Embed } from "../voyage";
import type { FileStore } from "./file-store";
import { buildOutline } from "./outline";
import { openPdf } from "./pdf";
import { extractSequence, type SequenceLlm } from "./sequence";

export interface IngestDeps {
  /** The `materials` collection: status, progress, chapters, lesson sequence. */
  repo: TeacherRepository;
  /** The whiteboard's passage store (`chunks`, with embeddings): what the tutor searches. */
  chunks: ChunkStore;
  files: FileStore;
  /** Voyage embeddings (`embedWithVoyage`). */
  embed: Embed;
  llm?: SequenceLlm | undefined;
  onStatus?: (material: Material) => void;
  log?: (message: string, error?: unknown) => void;
}

/** Calls `embed` in slices so progress can be reported while the (slow) embedding runs. */
function withProgress(embed: Embed, onProgress: (done: number, total: number) => void, slice = 128): Embed {
  return async (texts, input_type) => {
    const vectors: number[][] = [];
    onProgress(0, texts.length);
    for (let i = 0; i < texts.length; i += slice) {
      vectors.push(...(await embed(texts.slice(i, i + slice), input_type)));
      onProgress(Math.min(i + slice, texts.length), texts.length);
    }
    return vectors;
  };
}

/**
 * The upload job, in the order the tutor needs it:
 * PDF → text per page → chapters → passages + embeddings in `chunks` (the whiteboard's own `ingestPdf`) → lesson sequence
 * → `ready`. Only then does the material appear in the catalog and in the subject. Any failure removes the passages and marks
 * the material `failed` with the reason (nothing half-ingested stays searchable). Running it again re-does everything.
 */
export async function ingestMaterial(materialId: string, deps: IngestDeps): Promise<Material | null> {
  const { repo, chunks, files } = deps;
  const notify = (m: Material | null) => {
    if (m) deps.onStatus?.(m);
    return m;
  };
  const material = await repo.getMaterial(materialId);
  if (!material?.file) return null;
  const step = (stage: Material["progress"]["stage"], done = 0, total = 0, extra: Partial<Material> = {}) =>
    repo.updateMaterial(materialId, { ...extra, progress: { stage, done, total } });
  // Progress writes go one after another (never out of order) and at most ~50 per stage.
  let writes: Promise<unknown> = Promise.resolve();
  const progress = (stage: Material["progress"]["stage"], done: number, total: number) => {
    if (done !== total && done % Math.max(1, Math.floor(total / 50)) !== 0) return;
    writes = writes.then(() => step(stage, done, total)).then((m) => notify(m as Material | null), () => undefined);
  };

  try {
    notify(await step("extracting", 0, 0, { status: "processing", error: null }));
    await chunks.deletePassages?.(materialId); // a repeated ingestion (restart, retry) must not duplicate passages
    const data = await files.read(material.file.key);

    const pages = await extractPdfPages(new Uint8Array(data), (done, total) => progress("extracting", done, total));
    await writes;
    const bookmarks = await (await openPdf(data)).outline();
    const chapters = buildOutline(bookmarks, pages.map((p) => cleanPageText(p.text)));
    notify(await repo.updateMaterial(materialId, { pages: pages.length, chapters }));

    const report = await ingestPdf({
      pages,
      material_id: materialId,
      title: material.title,
      subject: material.subject,
      ...(material.subject_id ? { subject_id: material.subject_id } : {}),
      chapters,
      markReady: false,
      store: chunks,
      embed: withProgress(deps.embed, (done, total) => progress("embedding", done, total)),
      ...(deps.log ? { log: deps.log } : {}),
    });

    await writes;
    const sequence = await extractSequence({ outline: chapters, pages: pages.map((p) => cleanPageText(p.text)), llm: deps.llm });
    return notify(
      await step("done", report.passages, report.passages, {
        status: "ready", sequence, pages_needing_ocr: report.empty_pages, toc_pages: report.toc_pages, passages: report.passages, error: null,
      }),
    );
  } catch (err) {
    await chunks.deletePassages?.(materialId).catch(() => undefined);
    return notify(await repo.updateMaterial(materialId, { status: "failed", error: err instanceof Error ? err.message : String(err) }));
  }
}

/** Runs ingestions one at a time, in process (no external queue). Safe to re-create after a restart: see `recover`. */
export class MaterialIngestQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(private readonly deps: IngestDeps) {}

  enqueue(materialId: string): void {
    this.pending += 1;
    this.tail = this.tail
      .then(() => ingestMaterial(materialId, this.deps))
      .catch((err) => this.deps.log?.(`ingestion of ${materialId} crashed`, err))
      .finally(() => {
        this.pending -= 1;
      });
  }

  /** Re-queues uploads left `queued` or `processing` by a restart (their passages are cleared when the job starts). */
  async recover(): Promise<number> {
    const stuck = (await this.deps.repo.listMaterials()).filter((m) => m.file && (m.status === "queued" || m.status === "processing"));
    for (const m of stuck) this.enqueue(m.id);
    return stuck.length;
  }

  async idle(): Promise<void> {
    while (this.pending > 0) await this.tail;
  }
}
