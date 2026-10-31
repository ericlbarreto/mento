import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@mento/db";
import type { Material } from "@mento/contracts";
import { MaterialIngestQueue, MemoryFileStore, chunkPage, getOutline, ingestMaterial, makeTestPdf, validateCitation } from "../src/upload";
import { PAGES, book, queuedMaterial } from "./helpers";

describe("ingestion status (BR-22)", () => {
  it("BR-22 queued → processing (n/N) → ready, with pages, chunks, outline and OCR pages", async () => {
    const repo = new MemoryRepository();
    const store = new MemoryFileStore();
    const m = await queuedMaterial(repo, store, book());
    expect(m.status).toBe("queued");

    const seen: Pick<Material, "status" | "progress">[] = [];
    const done = await ingestMaterial(m.id, { repo, store, onStatus: (x) => seen.push({ status: x.status, progress: x.progress }) });

    expect(seen[0]).toEqual({ status: "processing", progress: { done: 0, total: 0 } });
    expect(seen.map((s) => s.progress.done)).toEqual(expect.arrayContaining([0, 1, 2, 3, 4]));
    expect(seen.at(-1)).toEqual({ status: "ready", progress: { done: 4, total: 4 } });
    expect(done).toMatchObject({ status: "ready", page_count: 4, pages_needing_ocr: [4], error: null });
    expect(done?.outline).toEqual([
      { title: "Capítulo 1 — Fundação de Roma", start_page: 1, end_page: 1 },
      { title: "Capítulo 2 — A República", start_page: 2, end_page: 4 },
    ]);
    expect(done?.sequence.map((l) => ({ id: l.lesson_id, prerequisites: l.prerequisites }))).toEqual([
      { id: "L1", prerequisites: [] },
      { id: "L2", prerequisites: ["L1"] },
    ]);
    expect((await repo.getPages(m.id, [1, 2, 3, 4])).map((c) => c.page)).toEqual([1, 2, 3]);
  });

  it("BR-22 a corrupt PDF ends failed with the error stored", async () => {
    const repo = new MemoryRepository();
    const store = new MemoryFileStore();
    const m = await queuedMaterial(repo, store, Buffer.from("%PDF-1.4 this is not really a pdf"), "ruim");
    const out = await ingestMaterial(m.id, { repo, store });
    expect(out?.status).toBe("failed");
    expect(out?.error).toBeTruthy();
    expect((await repo.getMaterial(m.id))?.status).toBe("failed");
  });

  it("BR-22 a missing file ends failed, a material without a file is ignored", async () => {
    const repo = new MemoryRepository();
    const store = new MemoryFileStore();
    const m = await repo.upsertMaterial({ title: "x", subject: "Outro", file: { key: "sumiu.pdf", size: 1, sha256: "s", mime: "application/pdf" } });
    expect((await ingestMaterial(m.id, { repo, store }))?.status).toBe("failed");
    const noFile = await repo.upsertMaterial({ title: "y", subject: "Outro" });
    expect(await ingestMaterial(noFile.id, { repo, store })).toBeNull();
  });

  it("BR-22 a restart during processing re-queues the material, which then finishes", async () => {
    const repo = new MemoryRepository();
    const store = new MemoryFileStore();
    const stuck = await queuedMaterial(repo, store, book(), "preso");
    await repo.updateMaterial(stuck.id, { status: "processing", progress: { done: 2, total: 4 } });
    const queued = await queuedMaterial(repo, store, book(), "fila");
    const finished = await queuedMaterial(repo, store, book(), "pronto");
    await repo.updateMaterial(finished.id, { status: "ready" });

    const queue = new MaterialIngestQueue({ repo, store });
    expect(await queue.recover()).toBe(2);
    await queue.idle();
    expect((await repo.getMaterial(stuck.id))?.status).toBe("ready");
    expect((await repo.getMaterial(queued.id))?.status).toBe("ready");
    expect((await repo.getMaterial(finished.id))?.progress).toEqual({ done: 0, total: 0 }); // untouched
  });

  it("BR-22 the queue processes one material at a time, in order", async () => {
    const repo = new MemoryRepository();
    const store = new MemoryFileStore();
    const a = await queuedMaterial(repo, store, book(), "a");
    const b = await queuedMaterial(repo, store, book(), "b");
    const order: string[] = [];
    const queue = new MaterialIngestQueue({ repo, store, onStatus: (m) => m.status === "processing" && m.progress.total === 0 && order.push(m.title) });
    queue.enqueue(a.id);
    queue.enqueue(b.id);
    await queue.idle();
    expect(order).toEqual(["a", "b"]);
  });
});

describe("chunks and citations (BR-23)", () => {
  it("BR-23 chunks keep the page and chapter; search finds the right page; citations are checked against the page", async () => {
    const repo = new MemoryRepository();
    const store = new MemoryFileStore();
    const m = await queuedMaterial(repo, store, book());
    await ingestMaterial(m.id, { repo, store });

    const chunks = await repo.getPages(m.id, [2]);
    expect(chunks[0]).toMatchObject({ page: 2, chapter: "Capítulo 2 — A República" });
    expect(chunks[0]!.text_norm).toContain("fim da republica");

    expect((await repo.searchChunks(m.id, "fim da república", 3))[0]?.page).toBe(2);
    expect((await repo.searchChunks(m.id, "Coliseu", 3))[0]?.page).toBe(3);

    const cite = (page: number, quote: string) => validateCitation(repo, { material_id: m.id, page, quote });
    expect(await cite(2, "O fim da República aconteceu")).toBe(true);
    expect(await cite(2, "o  FIM da republica   aconteceu")).toBe(true); // accents, case, spacing
    expect(await cite(2, "Otávio recebeu o título de Augusto")).toBe(true);
    expect(await cite(2, "Júlio César foi assassinado")).toBe(false); // invented
    expect(await cite(1, "O fim da República")).toBe(false); // right text, wrong page
    expect(await cite(2, "   ")).toBe(false);
    expect(await cite(99, "Roma")).toBe(false);
  });

  it("BR-23 a long page is split into chunks of at most 1500 characters without losing text", () => {
    const sentence = "Roma conquistou o Mediterrâneo depois das Guerras Púnicas. ";
    const page = Array.from({ length: 80 }, () => sentence).join("");
    const chunks = chunkPage(page);
    expect(chunks.length).toBeGreaterThan(2);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(1500);
    expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe(page.replace(/\s+/g, " ").trim());
    expect(chunkPage("")).toEqual([]);
    expect(chunkPage("curto")).toEqual(["curto"]);
  });

  it("BR-23 getOutline returns the stored outline", async () => {
    const repo = new MemoryRepository();
    const m = await repo.upsertMaterial({ title: "x", subject: "Outro", outline: [{ title: "A", start_page: 1, end_page: 2 }] });
    expect(await getOutline(repo, m.id)).toEqual([{ title: "A", start_page: 1, end_page: 2 }]);
    expect(await getOutline(repo, "000000000000000000000000")).toEqual([]);
  });
});

describe("lesson sequence (BR-24)", () => {
  it("BR-24 PDF bookmarks become the outline, in page order", async () => {
    const repo = new MemoryRepository();
    const store = new MemoryFileStore();
    const pdf = makeTestPdf(PAGES, { outline: [{ title: "Introdução", page: 1 }, { title: "A queda", page: 3 }] });
    const m = await queuedMaterial(repo, store, pdf, "marcado");
    const out = await ingestMaterial(m.id, { repo, store });
    expect(out?.outline).toEqual([
      { title: "Introdução", start_page: 1, end_page: 2 },
      { title: "A queda", start_page: 3, end_page: 4 },
    ]);
  });

  it("BR-24 without headings or bookmarks the whole document is one section", async () => {
    const repo = new MemoryRepository();
    const store = new MemoryFileStore();
    const m = await queuedMaterial(repo, store, makeTestPdf(["Texto corrido da primeira página, bem longo para ter texto suficiente aqui.", "Segunda página também com bastante texto corrido de exemplo."]), "plano");
    expect((await ingestMaterial(m.id, { repo, store }))?.outline).toEqual([{ title: "Documento", start_page: 1, end_page: 2 }]);
  });

  const outline = [
    { title: "A", start_page: 1, end_page: 2 },
    { title: "B", start_page: 3, end_page: 4 },
    { title: "C", start_page: 5, end_page: 6 },
  ];
  const lesson = (id: string, order: number, prerequisites: string[]) => ({
    lesson_id: id, order, title: id, pages: [order, order] as [number, number], taught_in_class: true, summary: "resumo", key_concepts: ["x"], activities: ["Atividade 1"], prerequisites,
  });

  it("BR-24 without an LLM: outline order, each lesson depends on the previous one, validates against the schema", async () => {
    const { extractSequence } = await import("../src");
    const { Lesson } = await import("@mento/contracts");
    const seq = await extractSequence({ outline, pages: [] });
    expect(seq.map((l) => [l.lesson_id, l.pages, l.prerequisites])).toEqual([["L1", [1, 2], []], ["L2", [3, 4], ["L1"]], ["L3", [5, 6], ["L2"]]]);
    for (const l of seq) expect(Lesson.safeParse(l).success).toBe(true);
  });

  it("BR-24 a valid LLM sequence is used (taught_in_class is never claimed); an invalid or failing one falls back", async () => {
    const { extractSequence, fallbackSequence } = await import("../src");
    const good = [lesson("L1", 1, []), lesson("L2", 2, ["L1"]), lesson("L3", 3, ["L1", "L2"])];
    const used = await extractSequence({ outline, pages: [], llm: { complete: async () => "```json\n" + JSON.stringify(good) + "\n```" } });
    expect(used.map((l) => l.prerequisites)).toEqual([[], ["L1"], ["L1", "L2"]]);
    expect(used.every((l) => l.taught_in_class === false)).toBe(true);
    expect(used[0]!.summary).toBe("resumo");

    const forward = [lesson("L1", 1, ["L3"]), lesson("L2", 2, []), lesson("L3", 3, [])];
    expect(await extractSequence({ outline, pages: [], llm: { complete: async () => JSON.stringify(forward) } })).toEqual(fallbackSequence(outline));
    expect(await extractSequence({ outline, pages: [], llm: { complete: async () => "não é json" } })).toEqual(fallbackSequence(outline));
    expect(await extractSequence({ outline, pages: [], llm: { complete: async () => { throw new Error("down"); } } })).toEqual(fallbackSequence(outline));
    expect(await extractSequence({ outline, pages: [], llm: { complete: async () => JSON.stringify(good.slice(0, 2)) } })).toEqual(fallbackSequence(outline));
  });
});
