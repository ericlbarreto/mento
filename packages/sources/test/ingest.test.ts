import { describe, expect, it } from "vitest";
import type { Material } from "@mento/contracts";
import { createRetriever } from "../src/retriever";
import { MaterialIngestQueue, extractSequence, fallbackSequence, ingestMaterial, makeTestPdf } from "../src";
import { PAGES, book, embed, queuedMaterial, world } from "./helpers";

describe("ingestion status (BR-22)", () => {
  it("BR-22 queued → extracting → embedding → ready; the tutor sees the material only when it is ready", async () => {
    const { repo, chunks, files, deps } = world();
    const m = await queuedMaterial(repo, files, book());
    expect(m.status).toBe("queued");

    const seen: Pick<Material, "status" | "progress">[] = [];
    const visibleWhileEmbedding: number[] = [];
    const out = await ingestMaterial(m.id, {
      ...deps,
      embed: async (texts, type) => {
        visibleWhileEmbedding.push((await chunks.listCatalog()).length); // asked while the embeddings are being made
        return embed(texts, type);
      },
      onStatus: (x) => seen.push({ status: x.status, progress: x.progress }),
    });

    expect(visibleWhileEmbedding).toEqual([0]);
    expect(seen[0]).toEqual({ status: "processing", progress: { stage: "extracting", done: 0, total: 0 } });
    const stages = [...new Set(seen.map((s) => s.progress.stage))];
    expect(stages).toEqual(["extracting", "embedding", "done"]);
    expect(seen.slice(0, -1).every((s) => s.status === "processing")).toBe(true);
    expect(out).toMatchObject({ status: "ready", pages: 4, pages_needing_ocr: [4], error: null, subject: "history", subject_id: "sub-history" });
    expect(out?.progress.stage).toBe("done");
    expect(out?.passages).toBe(chunks.passagesOf(m.id).length);
    expect(out?.passages).toBeGreaterThan(0);
    expect(out?.chapters).toEqual([
      { title: "Capítulo 1 — Fundação de Roma", start_page: 1, end_page: 1 },
      { title: "Capítulo 2 — A República", start_page: 2, end_page: 4 },
    ]);
    expect(out?.sequence.map((l) => ({ id: l.lesson_id, prerequisites: l.prerequisites }))).toEqual([
      { id: "L1", prerequisites: [] },
      { id: "L2", prerequisites: ["L1"] },
    ]);
    expect((await chunks.listCatalog()).map((c) => c.title)).toEqual(["Livro"]);
  });

  it("BR-22 a failing embedding ends failed with the reason, and no passage stays searchable", async () => {
    const { repo, chunks, files, deps } = world();
    const m = await queuedMaterial(repo, files, book());
    const out = await ingestMaterial(m.id, { ...deps, embed: async () => Promise.reject(new Error("Voyage embeddings failed: HTTP 429")) });
    expect(out).toMatchObject({ status: "failed", error: "Voyage embeddings failed: HTTP 429" });
    expect(chunks.passagesOf(m.id)).toEqual([]);
    expect(await chunks.listCatalog()).toEqual([]);
  });

  it("BR-22 a corrupt PDF ends failed with the error stored", async () => {
    const { repo, files, deps } = world();
    const m = await queuedMaterial(repo, files, Buffer.from("%PDF-1.4 this is not really a pdf"), "ruim");
    const out = await ingestMaterial(m.id, deps);
    expect(out?.status).toBe("failed");
    expect(out?.error).toBeTruthy();
    expect((await repo.getMaterial(m.id))?.status).toBe("failed");
  });

  it("BR-22 a missing file ends failed, a material without a file is ignored", async () => {
    const { repo, deps } = world();
    const m = await repo.upsertMaterial({ title: "x", subject: "history", file: { key: "sumiu.pdf", size: 1, sha256: "s", mime: "application/pdf" } });
    expect((await ingestMaterial(m.id, deps))?.status).toBe("failed");
    const noFile = await repo.upsertMaterial({ title: "y", subject: "history" });
    expect(await ingestMaterial(noFile.id, deps)).toBeNull();
  });

  it("BR-22 a restart during processing re-queues the material; the retry does not duplicate passages", async () => {
    const { repo, chunks, files, deps } = world();
    const stuck = await queuedMaterial(repo, files, book(), "preso");
    await repo.updateMaterial(stuck.id, { status: "processing", progress: { stage: "embedding", done: 2, total: 8 } });
    await chunks.insertPassages([{ material_id: stuck.id, subject: "history", page: 1, passage_idx: 0, text: "resto da tentativa anterior", embedding: [1, 0] }]);
    const queued = await queuedMaterial(repo, files, book(), "fila");
    const finished = await queuedMaterial(repo, files, book(), "pronto");
    await repo.updateMaterial(finished.id, { status: "ready" });

    const queue = new MaterialIngestQueue(deps);
    expect(await queue.recover()).toBe(2);
    await queue.idle();
    expect((await repo.getMaterial(stuck.id))?.status).toBe("ready");
    expect((await repo.getMaterial(queued.id))?.status).toBe("ready");
    expect(chunks.passagesOf(stuck.id).some((p) => p.text.includes("resto da tentativa"))).toBe(false);
    expect(chunks.passagesOf(stuck.id).length).toBe(chunks.passagesOf(queued.id).length); // same book, same passages, no leftovers
    expect((await repo.getMaterial(finished.id))?.progress.stage).toBe("queued"); // untouched
  });

  it("BR-22 the queue processes one material at a time, in order", async () => {
    const { repo, files, deps } = world();
    const a = await queuedMaterial(repo, files, book(), "a");
    const b = await queuedMaterial(repo, files, book(), "b");
    const order: string[] = [];
    const queue = new MaterialIngestQueue({ ...deps, onStatus: (m) => m.progress.stage === "extracting" && m.progress.total === 0 && order.push(m.title) });
    queue.enqueue(a.id);
    queue.enqueue(b.id);
    await queue.idle();
    expect(order).toEqual(["a", "b"]);
  });
});

describe("passages for the tutor (BR-23)", () => {
  it("BR-23 passages carry what the tutor's retriever filters on (material, subject key, chapter, page, embedding) and are found by it", async () => {
    const { repo, chunks, files, deps } = world();
    const m = await queuedMaterial(repo, files, book());
    await ingestMaterial(m.id, deps);

    const second = chunks.passagesOf(m.id).filter((p) => p.page === 2);
    expect(second.length).toBeGreaterThan(0);
    expect(second[0]).toMatchObject({ material_id: m.id, subject: "history", chapter: "Capítulo 2 — A República", page: 2, passage_idx: 0 });
    expect(second[0]!.embedding).toHaveLength(32);
    expect(chunks.passagesOf(m.id).some((p) => p.page === 4)).toBe(false); // the scanned page has no text

    const retriever = createRetriever({ store: chunks, embed });
    const hits = await retriever.searchChunks({ query: "fim da república", k: 3, material_id: m.id });
    expect(hits[0]).toMatchObject({ page: 2, material_id: m.id });
    expect((await retriever.searchChunks({ query: "coliseu", k: 3, material_id: m.id }))[0]?.page).toBe(3);
    expect(await retriever.searchChunks({ query: "coliseu", k: 3, material_ids: [] })).toEqual([]);
  });

  it("BR-23 the tutor's citation check accepts a real quote of the uploaded page and rejects an invented or misplaced one", async () => {
    const { repo, chunks, files, deps } = world();
    const m = await queuedMaterial(repo, files, book());
    await ingestMaterial(m.id, deps);
    const retriever = createRetriever({ store: chunks, embed });
    const cite = (page: number, quote: string) => retriever.validateCitation({ material_id: m.id, page, quote });
    expect(await cite(2, "O fim da República aconteceu")).toBe(true);
    expect(await cite(2, "o  FIM da república   aconteceu")).toBe(true); // case and spacing
    expect(await cite(2, "Júlio César foi assassinado")).toBe(false); // invented
    expect(await cite(1, "O fim da República")).toBe(false); // right text, wrong page
    expect(await cite(99, "Roma")).toBe(false);
  });
});

describe("lesson sequence (BR-24)", () => {
  it("BR-24 PDF bookmarks become the chapters, in page order", async () => {
    const { repo, files, deps } = world();
    const pdf = makeTestPdf(PAGES, { outline: [{ title: "Introdução", page: 1 }, { title: "A queda", page: 3 }] });
    const m = await queuedMaterial(repo, files, pdf, "marcado");
    const out = await ingestMaterial(m.id, deps);
    expect(out?.chapters).toEqual([
      { title: "Introdução", start_page: 1, end_page: 2 },
      { title: "A queda", start_page: 3, end_page: 4 },
    ]);
  });

  it("BR-24 without headings or bookmarks the whole document is one section", async () => {
    const { repo, files, deps } = world();
    const m = await queuedMaterial(repo, files, makeTestPdf(["Texto corrido da primeira página, bem longo para ter texto suficiente aqui.", "Segunda página também com bastante texto corrido de exemplo."]), "plano");
    expect((await ingestMaterial(m.id, deps))?.chapters).toEqual([{ title: "Documento", start_page: 1, end_page: 2 }]);
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
    const { Lesson } = await import("@mento/contracts");
    const seq = await extractSequence({ outline, pages: [] });
    expect(seq.map((l) => [l.lesson_id, l.pages, l.prerequisites])).toEqual([["L1", [1, 2], []], ["L2", [3, 4], ["L1"]], ["L3", [5, 6], ["L2"]]]);
    for (const l of seq) expect(Lesson.safeParse(l).success).toBe(true);
  });

  it("BR-24 a valid LLM sequence is used (taught_in_class is never claimed); an invalid or failing one falls back", async () => {
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
