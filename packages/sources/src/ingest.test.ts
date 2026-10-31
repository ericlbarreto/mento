import { describe, expect, it } from "vitest";
import type { ChunkStore, MaterialRecord, PassageRecord } from "@mento/contracts";
import { ingestPdf } from "./ingest";
import { makePdf } from "./testing/make-pdf";

function memoryStore() {
  const materials: Record<string, MaterialRecord> = {};
  const passages: PassageRecord[] = [];
  const store: ChunkStore = {
    vectorSearch: async () => [], textSearch: async () => [], getPagePassages: async () => [],
    insertPassages: async (p) => void passages.push(...p),
    createMaterial: async (m) => ((materials["mat1"] = { ...m }), { id: "mat1" }),
    updateMaterial: async (id, patch) => void Object.assign(materials[id]!, patch),
    listCatalog: async () => [],
  };
  return { store, materials, passages };
}
const embed = async (texts: string[]) => texts.map((t) => [t.length, 1]);

describe("ingestPdf", () => {
  const pdf = makePdf([
    "The Roman Republic began in 509 BC. It ended in 27 BC when Octavian became Augustus.",
    "",
    "Augustus became the first emperor of Rome. The Senate gave him the title in 27 BC.",
  ]);

  it("extracts, chunks, embeds and stores passages with their chapter, then marks the material ready", async () => {
    const { store, materials, passages } = memoryStore();
    const chapters = [{ title: "A República", start_page: 1, end_page: 1 }, { title: "O Império", start_page: 2, end_page: 3 }];
    const report = await ingestPdf({ data: pdf, title: "História de Roma", subject: "history", subject_id: "subj1", chapters, store, embed });
    expect(report).toEqual({ material_id: "mat1", pages: 3, passages: 2, empty_pages: [2], toc_pages: [] });
    expect(passages.map((p) => [p.page, p.chapter, p.passage_idx, p.material_id, p.subject])).toEqual([
      [1, "A República", 0, "mat1", "history"],
      [3, "O Império", 0, "mat1", "history"],
    ]);
    expect(passages[0]!.embedding).toEqual([passages[0]!.text.length, 1]);
    expect(materials["mat1"]).toMatchObject({ title: "História de Roma", pages: 3, status: "ready", subject_id: "subj1" });
  });

  it("marks the material failed when embedding fails, and reports empty pages through the logger", async () => {
    const { store, materials } = memoryStore();
    const logs: string[] = [];
    await expect(ingestPdf({ data: pdf, title: "t", subject: "s", store, embed: async () => { throw new Error("voyage down"); }, log: (m) => logs.push(m) })).rejects.toThrow("voyage down");
    expect(materials["mat1"]?.status).toBe("failed");
    expect(logs[0]).toContain("1 page(s) without a text layer: 2");
  });

  it("skips table-of-contents pages and stores cleaned text", async () => {
    const { store, passages } = memoryStore();
    const toc = makePdf([
      "Summary ............ 11 ............ 13 ............ 16 ............ 20",
      "Rome fought Carthage in the Punic Wars. The first war began in 264 BC.",
    ]);
    const report = await ingestPdf({ data: toc, title: "t", subject: "history", store, embed });
    expect(report.toc_pages).toEqual([1]);
    expect(passages.map((p) => p.page)).toEqual([2]);
  });
});
