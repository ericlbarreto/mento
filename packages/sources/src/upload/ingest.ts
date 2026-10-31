import type { TextChunk, Material, TeacherRepository } from "@mento/contracts";
import type { FileStore } from "./file-store";
import { buildOutline, chapterOf } from "./outline";
import { openPdf } from "./pdf";
import { extractSequence, type SequenceLlm } from "./sequence";
import { chunkPage, normalizeSearchText } from "./text";

/** Pages with fewer characters than this have no usable text layer (scanned): they need OCR/vision. */
export const MIN_TEXT_CHARS = 50;

export interface IngestDeps {
  repo: TeacherRepository;
  store: FileStore;
  llm?: SequenceLlm | undefined;
  onStatus?: (material: Material) => void;
}

/**
 * PDF → text per page → chunks → chapter outline → lesson sequence.
 * Updates `status` / `progress` on the material as it goes; a failure is stored on the material, not thrown.
 */
export async function ingestMaterial(materialId: string, deps: IngestDeps): Promise<Material | null> {
  const { repo, store } = deps;
  const notify = (m: Material | null) => {
    if (m) deps.onStatus?.(m);
    return m;
  };
  const material = await repo.getMaterial(materialId);
  if (!material?.file) return null;

  try {
    notify(await repo.updateMaterial(materialId, { status: "processing", error: null, progress: { done: 0, total: 0 } }));
    const pdf = await openPdf(await store.read(material.file.key));
    const total = pdf.pageCount;
    notify(await repo.updateMaterial(materialId, { page_count: total, progress: { done: 0, total } }));

    const pages: string[] = [];
    const needsOcr: number[] = [];
    for (let p = 1; p <= total; p++) {
      const text = await pdf.pageText(p);
      pages.push(text);
      if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) needsOcr.push(p);
      notify(await repo.updateMaterial(materialId, { progress: { done: p, total } }));
    }

    const outline = buildOutline(await pdf.outline(), pages);
    const chunks: TextChunk[] = pages.flatMap((text, i) =>
      chunkPage(text).map((piece, index) => ({
        material_id: materialId, page: i + 1, chunk_index: index, chapter: chapterOf(outline, i + 1), text: piece, text_norm: normalizeSearchText(piece),
      })),
    );
    const sequence = await extractSequence({ outline, pages, llm: deps.llm });

    await repo.replaceChunks(materialId, chunks);
    return notify(await repo.updateMaterial(materialId, { status: "ready", outline, sequence, pages_needing_ocr: needsOcr, progress: { done: total, total }, error: null }));
  } catch (err) {
    return notify(await repo.updateMaterial(materialId, { status: "failed", error: err instanceof Error ? err.message : String(err) }));
  }
}

/** Runs ingestions one at a time, in process (no external queue). Safe to re-create after a restart: see `recover`. */
export class MaterialIngestQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(
    private readonly deps: IngestDeps,
    private readonly log: (message: string, error?: unknown) => void = () => {},
  ) {}

  enqueue(materialId: string): void {
    this.pending += 1;
    this.tail = this.tail
      .then(() => ingestMaterial(materialId, this.deps))
      .catch((err) => this.log(`ingestion of ${materialId} crashed`, err))
      .finally(() => {
        this.pending -= 1;
      });
  }

  /** Re-queues materials left `queued` or `processing` by a restart. Returns how many were queued. */
  async recover(): Promise<number> {
    const stuck = (await this.deps.repo.listMaterials()).filter((m) => m.file && (m.status === "queued" || m.status === "processing"));
    for (const m of stuck) this.enqueue(m.id);
    return stuck.length;
  }

  async idle(): Promise<void> {
    while (this.pending > 0) await this.tail;
  }
}
