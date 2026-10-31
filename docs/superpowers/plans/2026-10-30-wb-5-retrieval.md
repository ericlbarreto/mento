# Whiteboard back-end, Plan 5: finding the answer in the teacher's materials (ingestion and hybrid search)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tutor finds the right passage in **all** of the teacher's materials without the student choosing one: books are ingested into passages with embeddings, and `searchChunks` answers a question with a fusion of vector and text search on MongoDB Atlas, with citations that can be checked against the page.

**Architecture:** `@mento/sources` holds the logic (chunking, rank fusion, Voyage embeddings, PDF text, ingestion, the `Retriever`) behind a `ChunkStore` interface defined in `@mento/contracts`; `@mento/db` implements that interface with Mongoose and the Atlas `$vectorSearch` / `$search` stages and creates the two search indexes. The tutor (Plan 3) only calls `Retriever.searchChunks` / `validateCitation`; it never sees vectors. The retriever degrades gracefully (one side down: the other answers; both down or database offline: empty result, never an error).

**Tech Stack:** TypeScript, Mongoose 9 / MongoDB Atlas (Vector Search + Atlas Search), Voyage `voyage-4` embeddings, `pdfjs-dist` 6 (text layer), Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md` (§6.1). Prerequisite: Plan 3 (`Retriever`, `Chunk`, `SearchQuery` in `@mento/contracts`). **Owner: Person 3 (whiteboard back-end)**: the founder moved ingestion and retrieval into this workstream on 2026-10-30 (decision D53); Person 1 keeps the material upload UI and the MongoDB `TurnRepository`.

## Global Constraints

- Vector search needs **MongoDB Atlas** (or a self-managed `mongot`); a plain local `mongod` has no `$vectorSearch`. The Atlas free tier allows 3 search/vector indexes in total; this plan uses 2 (`chunks_vector`, `chunks_text`).
- Embeddings: Voyage `voyage-4`, 1024 dimensions (the model default), cosine similarity, `input_type` `document` for passages and `query` for questions, at most 128 inputs per request. The first 200M tokens are free per account (a 300-page book is ~150k tokens). Portuguese quality is **[verify day 0]** (Task 6).
- A passage is ~1600 characters (about 400 tokens) inside a single page, split at sentence ends, with the last sentence repeated at the start of the next passage. Pages with fewer than 20 characters are reported as empty (they need OCR; the OCR/Gemini fallback is out of scope until the real book shows empty pages).
- Retrieval never throws into a turn: failures return `[]` and are logged; while MongoDB is disconnected `searchChunks` returns `[]` immediately (no 10 s Mongoose buffering wait).
- `material_id` is the string form of the material's MongoDB `_id`; `chunks` documents follow `baseSchemaOptions` (string `id` in JSON, `snake_case` fields). `embedding` is excluded from normal queries (`select: false`) and from every search projection.
- Packages never read environment variables; scripts and `apps/api/src/config.ts` pass plain options. `@mento/sources` depends only on `@mento/contracts` (+ `pdfjs-dist`); `@mento/db` only on `@mento/contracts` (+ `mongoose`).
- Product text stays in Brazilian Portuguese; code, comments and docs in English.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/contracts/src/chunk-store.ts` | `ChunkStore`, `PassageRecord`, `MaterialRecord`, `CatalogRecord`, `ChunkFilter` |
| `packages/sources/src/{chunker,chapters,rrf,normalize}.ts` | Pure logic: passages, outline parsing, rank fusion, text normalization |
| `packages/sources/src/voyage.ts` | `Embed` type and the Voyage client |
| `packages/sources/src/retriever.ts` | `createRetriever` (the `Retriever` the tutor uses) |
| `packages/sources/src/{pdf,ingest}.ts`, `testing/make-pdf.ts` | PDF text and `ingestPdf`; test PDF builder |
| `packages/sources/src/{index,ingest-entry}.ts` | Entry points (`@mento/sources`, `@mento/sources/ingest`) |
| `packages/db/src/models/{material,chunk}.model.ts` | Mongoose models |
| `packages/db/src/search-indexes.ts`, `mongo-chunk-store.ts` | Atlas index definitions and the `ChunkStore` implementation |
| `apps/api/src/with-catalog.ts`, `container.ts`, `config.ts` | Wiring into the tutor |
| `scripts/ingest.ts`, `scripts/retrieval-check.ts`, `fixtures/retrieval/questions.json` | Ingest a book; Day-0 retrieval check |

---

### Task 1: The `ChunkStore` contract, chunking, outline parsing and rank fusion

**Files:**
- Create: `packages/contracts/src/chunk-store.ts`
- Modify: `packages/contracts/src/index.ts` (add `export * from "./chunk-store";`)
- Create: `packages/sources/src/normalize.ts`, `chunker.ts`, `chapters.ts`, `rrf.ts`
- Test: `packages/sources/src/chunker.test.ts`, `chapters.test.ts`, `rrf.test.ts`

**Interfaces:**
- Produces: `ChunkStore` (`vectorSearch`, `textSearch`, `getPagePassages`, `insertPassages`, `createMaterial`, `updateMaterial`, `listCatalog`), `PassageRecord`, `MaterialRecord`, `CatalogRecord`, `ChunkFilter`; `chunkPages(pages, opts?)`, `chapterForPage(chapters, page)`, `parseChapters(spec)`, `reciprocalRankFusion(lists, k?)`, `normalizeText(s)`.

- [ ] **Step 1: Write the failing tests**

Create `packages/sources/src/chunker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chapterForPage, chunkPages } from "./chunker";

const sentence = (n: number) => `Esta é a frase número ${n} sobre a história de Roma antiga e suas instituições.`;
const longPage = (count: number) => Array.from({ length: count }, (_, i) => sentence(i + 1)).join(" ");

describe("chunkPages", () => {
  it("keeps a short page as one passage and skips pages with almost no text", () => {
    const out = chunkPages([{ page: 3, text: "A República romana começou em 509 a.C. Ela terminou em 27 a.C." }, { page: 4, text: "  12 " }, { page: 5, text: "" }]);
    expect(out).toEqual([{ page: 3, passage_idx: 0, text: "A República romana começou em 509 a.C. Ela terminou em 27 a.C." }]);
  });

  it("splits a long page at sentence ends, never crosses pages, and numbers passages per page", () => {
    const out = chunkPages([{ page: 1, text: longPage(60) }, { page: 2, text: longPage(3) }], { targetChars: 500, maxChars: 800, overlapChars: 200 });
    const page1 = out.filter((p) => p.page === 1);
    expect(page1.length).toBeGreaterThan(3);
    expect(page1.map((p) => p.passage_idx)).toEqual(page1.map((_, i) => i));
    for (const p of page1) {
      expect(p.text.length).toBeLessThanOrEqual(800 + 200);
      expect(p.text.endsWith(".")).toBe(true);
      expect(p.text.startsWith("Esta é a frase número")).toBe(true);
    }
    expect(out.filter((p) => p.page === 2)).toHaveLength(1);
    // consecutive passages share the last sentence (overlap)
    const lastOfFirst = page1[0]!.text.split(/(?<=\.)\s/).at(-1);
    expect(page1[1]!.text.startsWith(lastOfFirst as string)).toBe(true);
  });

  it("does not emit a passage made only of the carried overlap, and splits a huge sentence by words", () => {
    const out = chunkPages([{ page: 1, text: longPage(8) }], { targetChars: 400, maxChars: 600, overlapChars: 200 });
    const all = out.map((p) => p.text).join(" ");
    for (let n = 1; n <= 8; n++) expect(all).toContain(sentence(n));
    expect(out.at(-1)!.text).not.toBe(out.at(-2)!.text.split(/(?<=\.)\s/).at(-1));

    const huge = `Começo ${"palavra ".repeat(400)}fim.`;
    const split = chunkPages([{ page: 1, text: huge }], { targetChars: 500, maxChars: 600, overlapChars: 0 });
    expect(split.length).toBeGreaterThan(3);
    for (const p of split) expect(p.text.length).toBeLessThanOrEqual(600);
  });
});

describe("chapterForPage", () => {
  const chapters = [{ title: "A República", start_page: 1, end_page: 40 }, { title: "O Império", start_page: 41, end_page: 90 }];
  it("finds the chapter containing the page", () => {
    expect(chapterForPage(chapters, 12)).toBe("A República");
    expect(chapterForPage(chapters, 41)).toBe("O Império");
    expect(chapterForPage(chapters, 120)).toBeUndefined();
    expect(chapterForPage([], 1)).toBeUndefined();
  });
});
```

Create `packages/sources/src/chapters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseChapters } from "./chapters";

describe("parseChapters", () => {
  it("parses title:start-end items separated by semicolons", () => {
    expect(parseChapters("A República:1-40; O Império:41-90")).toEqual([
      { title: "A República", start_page: 1, end_page: 40 },
      { title: "O Império", start_page: 41, end_page: 90 },
    ]);
    expect(parseChapters("")).toEqual([]);
  });

  it("rejects malformed or reversed ranges", () => {
    expect(() => parseChapters("sem intervalo")).toThrow("expected title:start-end");
    expect(() => parseChapters("X:9-2")).toThrow("start is after end");
  });
});
```

Create `packages/sources/src/rrf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Chunk } from "@mento/contracts";
import { reciprocalRankFusion } from "./rrf";

const c = (id: string): Chunk => ({ id, material_id: "m", subject: "history", page: 1, passage_idx: 0, text: id });

describe("reciprocalRankFusion", () => {
  it("ranks chunks found by both lists above chunks found by one, and removes duplicates", () => {
    const out = reciprocalRankFusion([[c("a"), c("b"), c("c")], [c("b"), c("d")]]);
    expect(out.map((x) => x.id)).toEqual(["b", "a", "d", "c"]);
    expect(out[0]!.score).toBeCloseTo(1 / 62 + 1 / 61, 10);
  });

  it("handles empty lists and keeps the order of a single list", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[c("x"), c("y")], []]).map((x) => x.id)).toEqual(["x", "y"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mento/sources test`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Write the implementation**

Create `packages/contracts/src/chunk-store.ts`:

```ts
import type { Chunk } from "./retrieval";

/** A passage ready to be stored: a `Chunk` without id/score plus its embedding. */
export interface PassageRecord {
  material_id: string;
  subject: string;
  chapter?: string;
  page: number;
  passage_idx: number;
  text: string;
  embedding: number[];
}

export interface ChunkFilter {
  material_id?: string;
  subject?: string;
}

export interface MaterialRecord {
  title: string;
  subject: string;
  chapters: { title: string; start_page: number; end_page: number }[];
  pages: number;
  status: "processing" | "ready" | "failed";
}

/** What the tutor's prompt needs to know about each material (same shape as the tutor's `CatalogEntry`). */
export interface CatalogRecord {
  material_id: string;
  title: string;
  subject: string;
  chapters: string[];
}

/** Storage behind the retriever and the ingestion. Implemented by `MongoChunkStore` in @mento/db. */
export interface ChunkStore {
  vectorSearch(vector: number[], limit: number, filter: ChunkFilter): Promise<Chunk[]>;
  textSearch(query: string, limit: number, filter: ChunkFilter): Promise<Chunk[]>;
  getPagePassages(material_id: string, page: number): Promise<Chunk[]>;
  insertPassages(passages: PassageRecord[]): Promise<void>;
  createMaterial(material: MaterialRecord): Promise<{ id: string }>;
  updateMaterial(id: string, patch: Partial<MaterialRecord>): Promise<void>;
  listCatalog(): Promise<CatalogRecord[]>;
}
```

Add `export * from "./chunk-store";` to `packages/contracts/src/index.ts`.

Create `packages/sources/src/normalize.ts`:

```ts
/** Lowercase, collapse whitespace: used to compare quotes with page text. */
export const normalizeText = (s: string): string => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
```

Create `packages/sources/src/chunker.ts`:

```ts
export interface Passage {
  page: number;
  passage_idx: number;
  text: string;
}

export interface ChunkOptions {
  /** Close a passage once it has about this many characters (~400 tokens). */
  targetChars?: number;
  /** A single sentence longer than this is split by words. */
  maxChars?: number;
  /** The last sentence of a passage is repeated at the start of the next when it is at most this long. */
  overlapChars?: number;
}

const SENTENCE_END = /(?<=[.!?…])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9"“(])/;

const splitSentences = (text: string): string[] =>
  text.split(SENTENCE_END).map((s) => s.trim()).filter(Boolean);

function splitByWords(sentence: string, max: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of sentence.split(" ")) {
    if (current && current.length + 1 + word.length > max) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Split page texts into passages of about `targetChars`, never crossing a page, cutting at sentence ends.
 * Pages with almost no text produce no passage (the ingestion reports them as empty).
 */
export function chunkPages(pages: { page: number; text: string }[], opts: ChunkOptions = {}): Passage[] {
  const { targetChars = 1600, maxChars = 2200, overlapChars = 200 } = opts;
  const passages: Passage[] = [];

  for (const { page, text } of pages) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length < 20) continue;
    const sentences = splitSentences(clean).flatMap((s) => (s.length > maxChars ? splitByWords(s, maxChars) : [s]));

    let index = 0;
    let current: string[] = [];
    let fresh = 0; // sentences added since the last passage was closed (the carried overlap does not count)
    const close = () => {
      passages.push({ page, passage_idx: index++, text: current.join(" ") });
      const last = current[current.length - 1] as string;
      current = last.length <= overlapChars ? [last] : [];
      fresh = 0;
    };

    for (const sentence of sentences) {
      if (fresh > 0 && current.join(" ").length + 1 + sentence.length > targetChars) close();
      current.push(sentence);
      fresh++;
    }
    if (fresh > 0) passages.push({ page, passage_idx: index++, text: current.join(" ") });
  }
  return passages;
}

/** Title of the chapter that contains `page`, if the outline has one. */
export function chapterForPage(chapters: { title: string; start_page: number; end_page: number }[], page: number): string | undefined {
  return chapters.find((c) => page >= c.start_page && page <= c.end_page)?.title;
}
```

Create `packages/sources/src/chapters.ts`:

```ts
import type { MaterialRecord } from "@mento/contracts";

/**
 * Parse an outline given on the command line: `"A República:1-40;O Império:41-90"`.
 * Throws a readable error for anything that is not `title:start-end` with start <= end.
 */
export function parseChapters(spec: string): MaterialRecord["chapters"] {
  return spec
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(.+):(\d+)-(\d+)$/.exec(part);
      if (!match) throw new Error(`invalid chapter "${part}": expected title:start-end`);
      const start_page = Number(match[2]);
      const end_page = Number(match[3]);
      if (start_page > end_page) throw new Error(`invalid chapter "${part}": start is after end`);
      return { title: (match[1] as string).trim(), start_page, end_page };
    });
}
```

Create `packages/sources/src/rrf.ts`:

```ts
import type { Chunk } from "@mento/contracts";

/** Reciprocal rank fusion: merge ranked lists (vector, text) into one, scoring each chunk by 1 / (k + rank). */
export function reciprocalRankFusion(lists: Chunk[][], k = 60): Chunk[] {
  const scores = new Map<string, number>();
  const chunks = new Map<string, Chunk>();
  for (const list of lists) {
    list.forEach((chunk, rank) => {
      if (!chunks.has(chunk.id)) chunks.set(chunk.id, chunk);
      scores.set(chunk.id, (scores.get(chunk.id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...chunks.values()].map((c) => ({ ...c, score: scores.get(c.id) })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/sources test && pnpm --filter @mento/sources typecheck && pnpm --filter @mento/contracts typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/sources
git commit -m "feat(whiteboard): ChunkStore contract, passage chunking, outline parsing and rank fusion"
```

---

### Task 2: Voyage embeddings and the retriever

**Files:**
- Create: `packages/sources/src/voyage.ts`, `retriever.ts`, `index.ts`
- Test: `packages/sources/src/voyage.test.ts`, `retriever.test.ts`

**Interfaces:**
- Consumes: `ChunkStore`, `Retriever`, `Chunk`, `SearchQuery`, `Citation` from `@mento/contracts`; `reciprocalRankFusion`, `normalizeText`.
- Produces: `Embed = (texts: string[], input_type: "document" | "query") => Promise<number[][]>`, `embedWithVoyage(opts): Embed`, `createRetriever({ store, embed, isAvailable?, log? }): Retriever`.

- [ ] **Step 1: Write the failing tests**

Create `packages/sources/src/voyage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { embedWithVoyage } from "./voyage";

function fakeFetch() {
  const calls: { url: string; init: RequestInit; body: { input: string[]; model: string; input_type: string } }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, init, body });
    // answer out of order on purpose: the client must sort by index
    const data = body.input.map((t: string, index: number) => ({ index, embedding: [t.length, index] })).reverse();
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("embedWithVoyage", () => {
  it("sends the model, input type and bearer key, and returns vectors in input order", async () => {
    const { impl, calls } = fakeFetch();
    const embed = embedWithVoyage({ apiKey: "v-key", fetchImpl: impl });
    expect(await embed(["aa", "bbbb"], "query")).toEqual([[2, 0], [4, 1]]);
    expect(calls[0]!.url).toBe("https://api.voyageai.com/v1/embeddings");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer v-key");
    expect(calls[0]!.body).toEqual({ input: ["aa", "bbbb"], model: "voyage-4", input_type: "query" });
  });

  it("splits large inputs into batches of 128 and keeps the global order", async () => {
    const { impl, calls } = fakeFetch();
    const texts = Array.from({ length: 300 }, (_, i) => "x".repeat(i + 1));
    const out = await embedWithVoyage({ apiKey: "k", fetchImpl: impl })(texts, "document");
    expect(calls.map((c) => c.body.input.length)).toEqual([128, 128, 44]);
    expect(out).toHaveLength(300);
    expect(out[0]![0]).toBe(1);
    expect(out[299]![0]).toBe(300);
  });

  it("makes no request for no input and fails on an HTTP error", async () => {
    const { impl, calls } = fakeFetch();
    expect(await embedWithVoyage({ apiKey: "k", fetchImpl: impl })([], "query")).toEqual([]);
    expect(calls).toHaveLength(0);
    const failing = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(embedWithVoyage({ apiKey: "k", fetchImpl: failing })(["a"], "query")).rejects.toThrow("401");
  });
});
```

Create `packages/sources/src/retriever.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Chunk, ChunkFilter, ChunkStore } from "@mento/contracts";
import { createRetriever } from "./retriever";

const c = (id: string, page = 1, text = id): Chunk => ({ id, material_id: "m1", subject: "history", page, passage_idx: 0, text });

function fakeStore(over: Partial<ChunkStore> = {}) {
  const seen: { vector?: { v: number[]; limit: number; filter: ChunkFilter }; text?: { q: string; limit: number; filter: ChunkFilter } } = {};
  const store: ChunkStore = {
    vectorSearch: async (v, limit, filter) => ((seen.vector = { v, limit, filter }), [c("a"), c("b")]),
    textSearch: async (q, limit, filter) => ((seen.text = { q, limit, filter }), [c("b"), c("d")]),
    getPagePassages: async () => [],
    insertPassages: async () => undefined,
    createMaterial: async () => ({ id: "m" }),
    updateMaterial: async () => undefined,
    listCatalog: async () => [],
    ...over,
  };
  return { store, seen };
}
const embed = async (texts: string[], type: "document" | "query") => texts.map(() => [type === "query" ? 1 : 0, 0.5]);

describe("createRetriever.searchChunks", () => {
  it("embeds the question as a query, runs both searches with the filter and fuses the rankings", async () => {
    const { store, seen } = fakeStore();
    const out = await createRetriever({ store, embed }).searchChunks({ query: "fim da república", k: 2, subject: "history" });
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
    expect(seen.vector).toEqual({ v: [1, 0.5], limit: 10, filter: { material_id: undefined, subject: "history" } });
    expect(seen.text?.q).toBe("fim da república");
  });

  it("still answers when one side fails, and returns nothing (without throwing) when both fail", async () => {
    const logs: string[] = [];
    const log = (m: string) => void logs.push(m);
    const noVector = fakeStore({ vectorSearch: async () => { throw new Error("no index"); } }).store;
    expect((await createRetriever({ store: noVector, embed, log }).searchChunks({ query: "x", k: 5 })).map((x) => x.id)).toEqual(["b", "d"]);

    const badEmbed = async () => { throw new Error("voyage down"); };
    expect((await createRetriever({ store: fakeStore().store, embed: badEmbed, log }).searchChunks({ query: "x", k: 5 })).map((x) => x.id)).toEqual(["b", "d"]);

    const none = fakeStore({ vectorSearch: async () => { throw new Error("a"); }, textSearch: async () => { throw new Error("b"); } }).store;
    expect(await createRetriever({ store: none, embed, log }).searchChunks({ query: "x", k: 5 })).toEqual([]);
    expect(logs.filter((l) => l.includes("failed"))).toHaveLength(4);
  });
});

describe("createRetriever when the database is not available", () => {
  it("answers nothing at once, without touching the store or the embedder", async () => {
    let touched = 0;
    const { store } = fakeStore({ vectorSearch: async () => (touched++, []), textSearch: async () => (touched++, []), getPagePassages: async () => (touched++, []) });
    const r = createRetriever({ store, embed: async () => (touched++, [[1]]), isAvailable: () => false });
    expect(await r.searchChunks({ query: "x", k: 3 })).toEqual([]);
    expect(await r.validateCitation({ material_id: "m1", page: 1, quote: "x" })).toBe(false);
    expect(touched).toBe(0);
  });
});

describe("createRetriever.validateCitation", () => {
  const store = fakeStore({ getPagePassages: async (m, page) => (m === "m1" && page === 12 ? [c("p1", 12, "Em 27 a.C., o Senado concedeu a Otávio"), c("p2", 12, "o título de Augusto.")] : []) }).store;
  const retriever = createRetriever({ store, embed });

  it("accepts a quote that occurs on the page (even across passages and with different spacing or case)", async () => {
    expect(await retriever.validateCitation({ material_id: "m1", page: 12, quote: "o  Senado concedeu a OTÁVIO" })).toBe(true);
    expect(await retriever.validateCitation({ material_id: "m1", page: 12, quote: "a Otávio o título de Augusto" })).toBe(true);
  });

  it("rejects a quote that is not on the page or a page that does not exist", async () => {
    expect(await retriever.validateCitation({ material_id: "m1", page: 12, quote: "frase inventada" })).toBe(false);
    expect(await retriever.validateCitation({ material_id: "m1", page: 99, quote: "Senado" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mento/sources test`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Create `packages/sources/src/voyage.ts`:

```ts
/** Turns texts into vectors. `document` for stored passages, `query` for search questions. */
export type Embed = (texts: string[], input_type: "document" | "query") => Promise<number[][]>;

export interface VoyageOptions {
  apiKey: string;
  /** Default `voyage-4` (1024 dimensions, multilingual). */
  model?: string;
  baseUrl?: string;
  /** The API accepts up to 128 inputs per request. */
  batchSize?: number;
  fetchImpl?: typeof fetch;
}

export function embedWithVoyage(opts: VoyageOptions): Embed {
  const { apiKey, model = "voyage-4", baseUrl = "https://api.voyageai.com", batchSize = 128, fetchImpl = fetch } = opts;
  return async (texts, input_type) => {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const res = await fetchImpl(`${baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: texts.slice(i, i + batchSize), model, input_type }),
      });
      if (!res.ok) throw new Error(`Voyage embeddings failed: HTTP ${res.status}`);
      const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      vectors.push(...[...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
    }
    return vectors;
  };
}
```

Create `packages/sources/src/retriever.ts`:

```ts
import type { Chunk, Citation, ChunkStore, Retriever, SearchQuery } from "@mento/contracts";
import { normalizeText } from "./normalize";
import { reciprocalRankFusion } from "./rrf";
import type { Embed } from "./voyage";

export interface RetrieverDeps {
  store: ChunkStore;
  embed: Embed;
  /** Return false while the database is not connected: searches then answer [] at once instead of waiting for it. */
  isAvailable?: () => boolean;
  log?: (message: string, extra?: unknown) => void;
}

/**
 * Hybrid search over all materials: the question is embedded, the vector and the text searches run in
 * parallel, and their rankings are fused. If one side fails the other still answers; if both fail the
 * result is empty (a missing passage must never break a turn).
 */
export function createRetriever(deps: RetrieverDeps): Retriever {
  const { store, embed, log, isAvailable = () => true } = deps;
  return {
    async searchChunks(q: SearchQuery): Promise<Chunk[]> {
      if (!isAvailable()) return [];
      const filter = { material_id: q.material_id, subject: q.subject };
      const fetchLimit = Math.max(q.k * 2, 10);
      const [vector, text] = await Promise.allSettled([
        embed([q.query], "query").then(([v]) => store.vectorSearch(v as number[], fetchLimit, filter)),
        store.textSearch(q.query, fetchLimit, filter),
      ]);
      const lists: Chunk[][] = [];
      for (const [name, result] of [["vector", vector], ["text", text]] as const) {
        if (result.status === "fulfilled") lists.push(result.value);
        else log?.(`${name} search failed`, result.reason);
      }
      return reciprocalRankFusion(lists).slice(0, q.k);
    },

    async validateCitation(c: Citation): Promise<boolean> {
      if (!isAvailable()) return false;
      const passages = await store.getPagePassages(c.material_id, c.page);
      const page = normalizeText(passages.map((p) => p.text).join(" "));
      return page.includes(normalizeText(c.quote));
    },
  };
}
```

Create `packages/sources/src/index.ts`:

```ts
export * from "./normalize";
export * from "./retriever";
export * from "./rrf";
export * from "./voyage";
```

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/sources test && pnpm --filter @mento/sources typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sources
git commit -m "feat(whiteboard): Voyage embeddings and the hybrid retriever with graceful degradation"
```

---

### Task 3: PDF text and ingestion

**Files:**
- Create: `packages/sources/src/testing/make-pdf.ts`, `pdf.ts`, `ingest.ts`, `ingest-entry.ts`
- Modify: `packages/sources/package.json` (dependency `pdfjs-dist`; second export)
- Test: `packages/sources/src/pdf.test.ts`, `ingest.test.ts`

**Interfaces:**
- Consumes: `chunkPages`, `chapterForPage`, `Embed`, `ChunkStore`.
- Produces: `extractPdfPages(data): Promise<{ page; text }[]>`, `ingestPdf(input): Promise<IngestReport>` where `IngestReport = { material_id; pages; passages; empty_pages: number[] }`, test helper `makePdf(pages: string[]): Buffer`.

- [ ] **Step 1: Add the dependency and the subpath export**

Run: `pnpm --filter @mento/sources add pdfjs-dist@^6.4.299`
Then set `exports` in `packages/sources/package.json` to:

```json
"exports": {
  ".": "./src/index.ts",
  "./ingest": "./src/ingest-entry.ts"
}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/sources/src/testing/make-pdf.ts`:

```ts
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** Minimal valid PDF with one line of ASCII text per page (empty string = a page without text). */
export function makePdf(pages: string[]): Buffer {
  const objs: string[] = [];
  const pageNums = pages.map((_, i) => 4 + i * 2);
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((text, i) => {
    const content = text ? `BT /F1 12 Tf 72 720 Td (${esc(text)}) Tj ET` : "";
    objs[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objs[5 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
```

Create `packages/sources/src/pdf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makePdf } from "./testing/make-pdf";
import { extractPdfPages } from "./pdf";

describe("extractPdfPages", () => {
  it("reads the text of each page and reports empty pages", async () => {
    const pages = await extractPdfPages(makePdf(["The Roman Republic began in 509 BC.", "", "Augustus became the first emperor (27 BC)."]));
    expect(pages).toEqual([
      { page: 1, text: "The Roman Republic began in 509 BC." },
      { page: 2, text: "" },
      { page: 3, text: "Augustus became the first emperor (27 BC)." },
    ]);
  });
});
```

Create `packages/sources/src/ingest.test.ts`:

```ts
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
    const report = await ingestPdf({ data: pdf, title: "História de Roma", subject: "history", chapters, store, embed });
    expect(report).toEqual({ material_id: "mat1", pages: 3, passages: 2, empty_pages: [2] });
    expect(passages.map((p) => [p.page, p.chapter, p.passage_idx, p.material_id, p.subject])).toEqual([
      [1, "A República", 0, "mat1", "history"],
      [3, "O Império", 0, "mat1", "history"],
    ]);
    expect(passages[0]!.embedding).toEqual([passages[0]!.text.length, 1]);
    expect(materials["mat1"]).toMatchObject({ title: "História de Roma", pages: 3, status: "ready" });
  });

  it("marks the material failed when embedding fails, and reports empty pages through the logger", async () => {
    const { store, materials } = memoryStore();
    const logs: string[] = [];
    await expect(ingestPdf({ data: pdf, title: "t", subject: "s", store, embed: async () => { throw new Error("voyage down"); }, log: (m) => logs.push(m) })).rejects.toThrow("voyage down");
    expect(materials["mat1"]?.status).toBe("failed");
    expect(logs[0]).toContain("1 page(s) without a text layer: 2");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @mento/sources test`
Expected: FAIL (`./pdf` and `./ingest` do not exist).

- [ ] **Step 4: Write the implementation**

Create `packages/sources/src/pdf.ts`:

```ts
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PdfPage {
  page: number;
  text: string;
}

/** Text layer of every page of a PDF (1-based page numbers). Pages without a text layer come back with empty text. */
export async function extractPdfPages(data: Uint8Array): Promise<PdfPage[]> {
  const task = getDocument({ data: new Uint8Array(data), useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("").replace(/[ \t]+/g, " ").trim();
      pages.push({ page: n, text });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages;
}
```

Create `packages/sources/src/ingest.ts`:

```ts
import type { ChunkStore, MaterialRecord } from "@mento/contracts";
import { chapterForPage, chunkPages } from "./chunker";
import { extractPdfPages } from "./pdf";
import type { Embed } from "./voyage";

export interface IngestInput {
  data: Uint8Array;
  title: string;
  subject: string;
  chapters?: MaterialRecord["chapters"];
  store: ChunkStore;
  embed: Embed;
  log?: (message: string) => void;
}

export interface IngestReport {
  material_id: string;
  pages: number;
  passages: number;
  /** Pages with (almost) no text layer: they need OCR before they can be searched. */
  empty_pages: number[];
}

/** PDF → text per page → passages → embeddings → stored with the material. Marks the material failed on error. */
export async function ingestPdf(input: IngestInput): Promise<IngestReport> {
  const { data, title, subject, store, embed, log } = input;
  const chapters = input.chapters ?? [];
  const pages = await extractPdfPages(data);
  const { id } = await store.createMaterial({ title, subject, chapters, pages: pages.length, status: "processing" });
  try {
    const empty_pages = pages.filter((p) => p.text.replace(/\s/g, "").length < 20).map((p) => p.page);
    if (empty_pages.length) log?.(`${empty_pages.length} page(s) without a text layer: ${empty_pages.slice(0, 10).join(", ")}${empty_pages.length > 10 ? "…" : ""}`);
    const passages = chunkPages(pages);
    log?.(`${pages.length} pages → ${passages.length} passages; embedding…`);
    const vectors = await embed(passages.map((p) => p.text), "document");
    await store.insertPassages(
      passages.map((p, i) => ({
        material_id: id,
        subject,
        chapter: chapterForPage(chapters, p.page),
        page: p.page,
        passage_idx: p.passage_idx,
        text: p.text,
        embedding: vectors[i] as number[],
      })),
    );
    await store.updateMaterial(id, { status: "ready" });
    return { material_id: id, pages: pages.length, passages: passages.length, empty_pages };
  } catch (err) {
    await store.updateMaterial(id, { status: "failed" });
    throw err;
  }
}
```

Create `packages/sources/src/ingest-entry.ts`:

```ts
// Ingestion tools (PDF parsing pulls in pdfjs-dist, so they live behind a separate entry point).
export * from "./chapters";
export * from "./chunker";
export * from "./ingest";
export * from "./pdf";
```

- [ ] **Step 5: Run the tests and the type check**

Run: `pnpm --filter @mento/sources test && pnpm --filter @mento/sources typecheck`
Expected: PASS (the PDF test builds a real 3-page PDF in memory, one page without text).

- [ ] **Step 6: Commit**

```bash
git add packages/sources pnpm-lock.yaml
git commit -m "feat(whiteboard): PDF text extraction and the ingestion pipeline"
```

---

### Task 4: MongoDB models, Atlas search indexes and the chunk store

**Files:**
- Create: `packages/db/src/models/material.model.ts`, `packages/db/src/models/chunk.model.ts`
- Modify: `packages/db/src/models/index.ts` (replace the placeholder), `packages/db/src/index.ts`
- Create: `packages/db/src/search-indexes.ts`, `packages/db/src/mongo-chunk-store.ts`
- Test: `packages/db/src/search-indexes.test.ts`, `packages/db/src/mongo-chunk-store.test.ts`, `packages/db/src/mongo-chunk-store.atlas.test.ts` (skipped unless `ATLAS_TEST_URI` is set)

**Interfaces:**
- Consumes: `ChunkStore` and related types from `@mento/contracts`; `baseSchemaOptions`, `connectMongo`, `disconnectMongo` (existing).
- Produces: `MaterialModel`, `ChunkModel`, `MongoChunkStore`, `vectorPipeline`, `textPipeline`, `ensureSearchIndexes(collection)`, `ensureChunkIndexes()`, `vectorIndexDefinition()`, `textIndexDefinition()`, constants `VECTOR_INDEX`, `TEXT_INDEX`, `EMBEDDING_DIMENSIONS`.

- [ ] **Step 1: Write the failing tests**

Create `packages/db/src/search-indexes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TEXT_INDEX, VECTOR_INDEX, ensureSearchIndexes, textIndexDefinition, vectorIndexDefinition, type SearchIndexCollection } from "./search-indexes";

function fakeCollection(existing: string[]) {
  const created: { name: string; type?: string; definition: unknown }[] = [];
  const collection: SearchIndexCollection = {
    listSearchIndexes: () => ({ toArray: async () => existing.map((name) => ({ name })) }),
    createSearchIndex: async (d) => (created.push(d), d.name),
  };
  return { collection, created };
}

describe("ensureSearchIndexes", () => {
  it("creates both indexes when none exist, with the right types", async () => {
    const { collection, created } = fakeCollection([]);
    expect(await ensureSearchIndexes(collection)).toEqual([VECTOR_INDEX, TEXT_INDEX]);
    expect(created.map((c) => [c.name, c.type])).toEqual([[VECTOR_INDEX, "vectorSearch"], [TEXT_INDEX, "search"]]);
  });

  it("creates only the missing one and nothing when both exist", async () => {
    const some = fakeCollection([VECTOR_INDEX]);
    expect(await ensureSearchIndexes(some.collection)).toEqual([TEXT_INDEX]);
    const all = fakeCollection([VECTOR_INDEX, TEXT_INDEX]);
    expect(await ensureSearchIndexes(all.collection)).toEqual([]);
    expect(all.created).toEqual([]);
  });
});

describe("index definitions", () => {
  it("uses 1024-dimension cosine vectors with material and subject filters", () => {
    expect(vectorIndexDefinition().fields).toEqual([
      { type: "vector", path: "embedding", numDimensions: 1024, similarity: "cosine" },
      { type: "filter", path: "material_id" },
      { type: "filter", path: "subject" },
    ]);
  });

  it("uses the Portuguese analyzer on the passage text", () => {
    expect(textIndexDefinition().mappings.fields.text.analyzer).toBe("lucene.portuguese");
  });
});
```

Create `packages/db/src/mongo-chunk-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { textPipeline, vectorPipeline } from "./mongo-chunk-store";

describe("vectorPipeline", () => {
  it("uses the vector index with candidates >= 100 and no filter by default", () => {
    const [search, project] = vectorPipeline([0.1, 0.2], 10, {}) as [{ $vectorSearch: Record<string, unknown> }, Record<string, unknown>];
    expect(search.$vectorSearch).toEqual({ index: "chunks_vector", path: "embedding", queryVector: [0.1, 0.2], numCandidates: 100, limit: 10 });
    expect(project).toEqual({ $project: { embedding: 0, score: { $meta: "vectorSearchScore" } } });
  });

  it("raises numCandidates with the limit and builds equality pre-filters", () => {
    const one = vectorPipeline([1], 20, { subject: "history" })[0] as { $vectorSearch: Record<string, unknown> };
    expect(one.$vectorSearch.numCandidates).toBe(200);
    expect(one.$vectorSearch.filter).toEqual({ subject: { $eq: "history" } });
    const both = vectorPipeline([1], 5, { material_id: "m1", subject: "history" })[0] as { $vectorSearch: Record<string, unknown> };
    expect(both.$vectorSearch.filter).toEqual({ $and: [{ material_id: { $eq: "m1" } }, { subject: { $eq: "history" } }] });
  });
});

describe("textPipeline", () => {
  it("searches the text index, matches material and subject afterwards, and limits", () => {
    expect(textPipeline("fim da república", 10, {})).toEqual([
      { $search: { index: "chunks_text", text: { query: "fim da república", path: "text" } } },
      { $limit: 10 },
      { $project: { embedding: 0, score: { $meta: "searchScore" } } },
    ]);
    expect(textPipeline("x", 5, { subject: "history" })[1]).toEqual({ $match: { subject: "history" } });
  });
});
```

Create `packages/db/src/mongo-chunk-store.atlas.test.ts`:

```ts
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoChunkStore, ensureChunkIndexes } from "./mongo-chunk-store";
import { connectMongo, disconnectMongo } from "./connection";

// Runs only against a real Atlas cluster: ATLAS_TEST_URI=mongodb+srv://... pnpm --filter @mento/db test
const uri = process.env.ATLAS_TEST_URI;

describe.skipIf(!uri)("MongoChunkStore on Atlas", () => {
  const store = new MongoChunkStore();
  const subject = `test-${Date.now()}`;
  let material_id = "";

  beforeAll(async () => {
    await connectMongo(uri as string);
    await ensureChunkIndexes();
    ({ id: material_id } = await store.createMaterial({ title: "Teste", subject, chapters: [], pages: 1, status: "ready" }));
    const vec = (a: number, b: number) => Array.from({ length: 1024 }, (_, i) => (i === 0 ? a : i === 1 ? b : 0));
    await store.insertPassages([
      { material_id, subject, page: 1, passage_idx: 0, text: "O Senado concedeu a Otávio o título de Augusto.", embedding: vec(1, 0) },
      { material_id, subject, page: 2, passage_idx: 0, text: "Os aquedutos levavam água às cidades romanas.", embedding: vec(0, 1) },
    ]);
    // Atlas builds search indexes asynchronously: wait until both answer queries.
    const db = mongoose.connection.db!;
    for (let i = 0; i < 60; i++) {
      const indexes = (await db.collection("chunks").listSearchIndexes().toArray()) as { queryable?: boolean }[];
      if (indexes.length >= 2 && indexes.every((x) => x.queryable)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }, 180_000);

  afterAll(async () => {
    await mongoose.connection.db?.collection("chunks").deleteMany({ material_id });
    await mongoose.connection.db?.collection("materials").deleteMany({ subject });
    await disconnectMongo();
  });

  it("finds the closest passage by vector and by text, with the subject filter", async () => {
    const vec = Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0));
    const byVector = await store.vectorSearch(vec, 2, { subject });
    expect(byVector[0]?.page).toBe(1);
    const byText = await store.textSearch("aqueduto", 2, { subject });
    expect(byText[0]?.page).toBe(2);
    expect((await store.listCatalog()).some((m) => m.material_id === material_id)).toBe(true);
    expect((await store.getPagePassages(material_id, 1))[0]?.text).toContain("Senado");
  }, 60_000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mento/db test`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Write the implementation**

Create `packages/db/src/models/material.model.ts`:

```ts
import { Schema, model, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "../schema-options";

const chapterSchema = new Schema(
  { title: { type: String, required: true }, start_page: { type: Number, required: true }, end_page: { type: Number, required: true } },
  { _id: false },
);

const materialSchema = new Schema(
  {
    title: { type: String, required: true },
    subject: { type: String, required: true, index: true },
    chapters: { type: [chapterSchema], default: [] },
    pages: { type: Number, required: true },
    status: { type: String, enum: ["processing", "ready", "failed"], default: "processing" },
  },
  baseSchemaOptions,
);

export type MaterialDoc = InferSchemaType<typeof materialSchema>;
export const MaterialModel = model("Material", materialSchema);
```

Create `packages/db/src/models/chunk.model.ts`:

```ts
import { Schema, model, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "../schema-options";

/** One passage (~400 tokens inside a single page) of a material, with its embedding. */
const chunkSchema = new Schema(
  {
    material_id: { type: String, required: true },
    subject: { type: String, required: true },
    chapter: { type: String },
    page: { type: Number, required: true },
    passage_idx: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true, select: false },
  },
  baseSchemaOptions,
);
chunkSchema.index({ material_id: 1, page: 1, passage_idx: 1 });

export type ChunkDoc = InferSchemaType<typeof chunkSchema>;
export const ChunkModel = model("Chunk", chunkSchema);
```

Create `packages/db/src/search-indexes.ts`:

```ts
export const VECTOR_INDEX = "chunks_vector";
export const TEXT_INDEX = "chunks_text";
export const EMBEDDING_DIMENSIONS = 1024;

/** The slice of the MongoDB driver's `Collection` used to manage Atlas Search indexes. */
export interface SearchIndexCollection {
  listSearchIndexes(): { toArray(): Promise<{ name?: string }[]> };
  createSearchIndex(description: { name: string; type?: "search" | "vectorSearch"; definition: Record<string, unknown> }): Promise<string>;
}

/** Vector index on the embedding; `material_id` and `subject` can be used as pre-filters. */
export const vectorIndexDefinition = () => ({
  fields: [
    { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMENSIONS, similarity: "cosine" },
    { type: "filter", path: "material_id" },
    { type: "filter", path: "subject" },
  ],
});

/** Full-text index on the passage text with the Portuguese analyzer (accents and stemming). */
export const textIndexDefinition = () => ({
  mappings: { dynamic: false, fields: { text: { type: "string", analyzer: "lucene.portuguese" } } },
});

/** Create the two search indexes if they do not exist yet. Returns the names it created. */
export async function ensureSearchIndexes(collection: SearchIndexCollection): Promise<string[]> {
  const existing = new Set((await collection.listSearchIndexes().toArray()).map((i) => i.name));
  const created: string[] = [];
  if (!existing.has(VECTOR_INDEX)) {
    await collection.createSearchIndex({ name: VECTOR_INDEX, type: "vectorSearch", definition: vectorIndexDefinition() });
    created.push(VECTOR_INDEX);
  }
  if (!existing.has(TEXT_INDEX)) {
    await collection.createSearchIndex({ name: TEXT_INDEX, type: "search", definition: textIndexDefinition() });
    created.push(TEXT_INDEX);
  }
  return created;
}
```

Create `packages/db/src/mongo-chunk-store.ts`:

```ts
import mongoose from "mongoose";
import type { CatalogRecord, Chunk, ChunkFilter, ChunkStore, MaterialRecord, PassageRecord } from "@mento/contracts";
import { ChunkModel } from "./models/chunk.model";
import { MaterialModel } from "./models/material.model";
import { TEXT_INDEX, VECTOR_INDEX, ensureSearchIndexes } from "./search-indexes";

interface ChunkDoc {
  _id: unknown;
  material_id: string;
  subject: string;
  chapter?: string | null;
  page: number;
  passage_idx: number;
  text: string;
  score?: number;
}

const toChunk = (d: ChunkDoc): Chunk => ({
  id: String(d._id),
  material_id: d.material_id,
  subject: d.subject,
  chapter: d.chapter ?? undefined,
  page: d.page,
  passage_idx: d.passage_idx,
  text: d.text,
  score: d.score,
});

const equalities = (f: ChunkFilter): Record<string, { $eq: string }>[] => {
  const out: Record<string, { $eq: string }>[] = [];
  if (f.material_id) out.push({ material_id: { $eq: f.material_id } });
  if (f.subject) out.push({ subject: { $eq: f.subject } });
  return out;
};

/** `$vectorSearch` over the embeddings, optionally pre-filtered by material and subject. */
export function vectorPipeline(vector: number[], limit: number, filter: ChunkFilter): Record<string, unknown>[] {
  const conditions = equalities(filter);
  return [
    {
      $vectorSearch: {
        index: VECTOR_INDEX,
        path: "embedding",
        queryVector: vector,
        numCandidates: Math.max(100, limit * 10),
        limit,
        ...(conditions.length === 1 ? { filter: conditions[0] } : conditions.length > 1 ? { filter: { $and: conditions } } : {}),
      },
    },
    { $project: { embedding: 0, score: { $meta: "vectorSearchScore" } } },
  ];
}

/** Atlas Search full-text query on the passage text; material/subject are applied right after. */
export function textPipeline(query: string, limit: number, filter: ChunkFilter): Record<string, unknown>[] {
  const match: Record<string, string> = {};
  if (filter.material_id) match.material_id = filter.material_id;
  if (filter.subject) match.subject = filter.subject;
  return [
    { $search: { index: TEXT_INDEX, text: { query, path: "text" } } },
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $limit: limit },
    { $project: { embedding: 0, score: { $meta: "searchScore" } } },
  ];
}

export class MongoChunkStore implements ChunkStore {
  async vectorSearch(vector: number[], limit: number, filter: ChunkFilter): Promise<Chunk[]> {
    const docs = await ChunkModel.aggregate<ChunkDoc>(vectorPipeline(vector, limit, filter) as never);
    return docs.map(toChunk);
  }

  async textSearch(query: string, limit: number, filter: ChunkFilter): Promise<Chunk[]> {
    const docs = await ChunkModel.aggregate<ChunkDoc>(textPipeline(query, limit, filter) as never);
    return docs.map(toChunk);
  }

  async getPagePassages(material_id: string, page: number): Promise<Chunk[]> {
    const docs = await ChunkModel.find({ material_id, page }).sort({ passage_idx: 1 }).lean<ChunkDoc[]>();
    return docs.map(toChunk);
  }

  async insertPassages(passages: PassageRecord[]): Promise<void> {
    // Embeddings are ~8 KB each: insert in batches to stay far below the 16 MB document-batch limit.
    for (let i = 0; i < passages.length; i += 500) {
      await ChunkModel.insertMany(passages.slice(i, i + 500), { ordered: false });
    }
  }

  async createMaterial(material: MaterialRecord): Promise<{ id: string }> {
    const doc = await MaterialModel.create(material);
    return { id: String(doc._id) };
  }

  async updateMaterial(id: string, patch: Partial<MaterialRecord>): Promise<void> {
    await MaterialModel.findByIdAndUpdate(id, patch);
  }

  async listCatalog(): Promise<CatalogRecord[]> {
    const docs = await MaterialModel.find({ status: "ready" })
      .sort({ createdAt: 1 })
      .lean<{ _id: unknown; title: string; subject: string; chapters?: { title: string }[] }[]>();
    return docs.map((d) => ({ material_id: String(d._id), title: d.title, subject: d.subject, chapters: (d.chapters ?? []).map((c) => c.title) }));
  }
}

/** Create the vector and text indexes on the `chunks` collection (idempotent). Needs MongoDB Atlas (or `mongot`). */
export async function ensureChunkIndexes(): Promise<string[]> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is not connected");
  return ensureSearchIndexes(db.collection(ChunkModel.collection.name));
}
```

Replace `packages/db/src/models/index.ts`:

```ts
// Register and re-export every Mongoose model here, one line per file.
// Each person creates the models of their own area (see README.md in this folder).
export * from "./material.model";
export * from "./chunk.model";
```

Replace `packages/db/src/index.ts`:

```ts
export * from "./connection";
export * from "./schema-options";
export * from "./models";
export * from "./search-indexes";
export * from "./mongo-chunk-store";
```

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/db test && pnpm --filter @mento/db typecheck`
Expected: PASS (the Atlas test is reported as skipped). To run it against a real Atlas cluster: `ATLAS_TEST_URI="mongodb+srv://…" pnpm --filter @mento/db test` (it creates the two indexes, waits until they are queryable, inserts two passages, checks vector and text search, and cleans up; allow up to 3 minutes the first time).

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(whiteboard): MongoDB models, Atlas search indexes and the chunk store"
```

---

### Task 5: Wire the retriever and the catalog into the API and the tutor

**Files:**
- Create: `apps/api/src/with-catalog.ts`
- Test: `apps/api/src/with-catalog.test.ts`
- Modify: `apps/api/src/config.ts` (add `VOYAGE_API_KEY`), `apps/api/src/container.ts` (replace the file)
- Modify: `workstreams/contracts-spec.md` (new section 13), `.env.example`

**Interfaces:**
- Consumes: `createRetriever`, `embedWithVoyage`, `MongoChunkStore`, `mongoState`, `TurnRepository`.
- Produces: `withCatalog(repo, listCatalog, isAvailable): TurnRepository`; container member `retriever: Retriever`; `Config.VOYAGE_API_KEY`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/with-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryTurnRepository } from "@mento/tutor/testing";
import { withCatalog } from "./with-catalog";

const base = () => new InMemoryTurnRepository({ catalog: [{ material_id: "demo", title: "Demo", subject: "history", chapters: [] }] });
const mongoCatalog = [{ material_id: "m1", title: "História de Roma", subject: "history", chapters: ["A República"] }];

describe("withCatalog", () => {
  it("uses the catalog from MongoDB when it is available and not empty", async () => {
    const repo = withCatalog(base(), async () => mongoCatalog, () => true);
    expect(await repo.getCatalog()).toEqual(mongoCatalog);
  });

  it("falls back to the base repository when MongoDB is offline, empty or failing", async () => {
    const demo = (await base().getCatalog())[0]!.material_id;
    expect((await withCatalog(base(), async () => mongoCatalog, () => false).getCatalog())[0]!.material_id).toBe(demo);
    expect((await withCatalog(base(), async () => [], () => true).getCatalog())[0]!.material_id).toBe(demo);
    expect((await withCatalog(base(), async () => { throw new Error("down"); }, () => true).getCatalog())[0]!.material_id).toBe(demo);
  });

  it("does not wait for MongoDB when it is offline", async () => {
    let called = 0;
    await withCatalog(base(), async () => (called++, mongoCatalog), () => false).getCatalog();
    expect(called).toBe(0);
  });

  it("forwards every other repository call", async () => {
    const repo = withCatalog(base(), async () => mongoCatalog, () => true);
    const { id } = await repo.createSession({ student_id: "stu_1", modality: "text" });
    expect(await repo.getSession(id)).toMatchObject({ student_id: "stu_1" });
    await repo.appendEvent(id, { type: "mic_state", payload: { muted: false } });
    expect((await repo.listEvents(id)).map((e) => e.type)).toEqual(["session_started", "mic_state"]);
    await repo.endSession(id, "manual");
    expect((await repo.listEvents(id)).at(-1)?.type).toBe("session_ended");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/api test`
Expected: FAIL (`./with-catalog` does not exist).

- [ ] **Step 3: Implement**

Create `apps/api/src/with-catalog.ts`:

```ts
import type { CatalogRecord } from "@mento/contracts";
import type { TurnRepository } from "@mento/tutor";

/**
 * Takes the catalog of materials from MongoDB when it is reachable (otherwise from the base repository).
 * Person 1's MongoDB repository replaces this wrapper when it implements `getCatalog` itself.
 */
export function withCatalog(repo: TurnRepository, listCatalog: () => Promise<CatalogRecord[]>, isAvailable: () => boolean): TurnRepository {
  return {
    createSession: (input) => repo.createSession(input),
    getSession: (id) => repo.getSession(id),
    appendEvent: (id, event) => repo.appendEvent(id, event),
    listEvents: (id) => repo.listEvents(id),
    endSession: (id, reason) => repo.endSession(id, reason),
    getClassContext: () => repo.getClassContext(),
    getLearnerSummary: (student_id) => repo.getLearnerSummary(student_id),
    async getCatalog() {
      if (isAvailable()) {
        try {
          const catalog = await listCatalog();
          if (catalog.length > 0) return catalog;
        } catch {
          /* use the base repository */
        }
      }
      return repo.getCatalog();
    },
  };
}
```

Add to the schema in `apps/api/src/config.ts`: `VOYAGE_API_KEY: z.string().default(""),`. Append to `.env.example`: `VOYAGE_API_KEY=`.

Replace `apps/api/src/container.ts` with the final version (it includes everything added by Plans 2 to 4):

```ts
import { join } from "node:path";
import type { Retriever } from "@mento/contracts";
import { MongoChunkStore, mongoState } from "@mento/db";
import { createRetriever, embedWithVoyage } from "@mento/sources";
import {
  AnthropicLlm,
  ClaudeJudge,
  GeminiImageClient,
  ImageDrawPipeline,
  ImageStore,
  InMemoryEvidenceStore,
  TurnEngine,
  captionOnlyDraw,
  emptyRetriever,
  loadPromptsSync,
  type DrawPipeline,
  type EvidenceStore,
  type TurnRepository,
} from "@mento/tutor";
import { InMemoryTurnRepository } from "@mento/tutor/testing";
import { createTtsService, mintSttToken, VoiceConfigError, type TtsService } from "@mento/voice/server";
import type { Config } from "./config";
import { MongoService } from "./services/mongo.service";
import { withCatalog } from "./with-catalog";

export interface Container {
  config: Config;
  mongo: MongoService;
  mintSttToken: typeof mintSttToken;
  /** null when ElevenLabs is not configured: the audio route answers 503 and the tutor falls back to captions. */
  tts: TtsService | null;
  /** In memory (events) until Person 1's MongoDB repository replaces it; the catalog already comes from MongoDB. */
  repo: TurnRepository;
  images: ImageStore;
  /** In memory until Person 1's MongoDB repository implements insertEvidence. */
  evidence: EvidenceStore;
  /** Hybrid search over the teacher's materials; finds nothing until VOYAGE_API_KEY and MongoDB Atlas are set up. */
  retriever: Retriever;
  /** null when ANTHROPIC_API_KEY is not set: the turn route answers 503. */
  engine: TurnEngine | null;
}

const isMongoUp = () => mongoState() === "connected";

function buildTts(config: Config): TtsService | null {
  try {
    return createTtsService({
      provider: config.TTS_MODE,
      apiKey: config.ELEVENLABS_API_KEY,
      voiceId: config.ELEVENLABS_VOICE_ID,
      modelId: config.ELEVENLABS_MODEL,
      cacheDir: join(config.DATA_DIR, "files", "tts"),
    });
  } catch (err) {
    if (err instanceof VoiceConfigError) return null;
    throw err;
  }
}

function buildDraw(config: Config, images: ImageStore): DrawPipeline {
  if (!config.GEMINI_API_KEY) return captionOnlyDraw;
  return new ImageDrawPipeline({
    client: new GeminiImageClient({ apiKey: config.GEMINI_API_KEY, model: config.IMAGE_MODEL }),
    store: images,
    model: config.IMAGE_MODEL,
  });
}

function buildRetriever(config: Config, store: MongoChunkStore): Retriever {
  if (!config.VOYAGE_API_KEY) return emptyRetriever;
  return createRetriever({ store, embed: embedWithVoyage({ apiKey: config.VOYAGE_API_KEY }), isAvailable: isMongoUp });
}

function buildEngine(config: Config, repo: TurnRepository, tts: TtsService | null, images: ImageStore, evidence: EvidenceStore, retriever: Retriever): TurnEngine | null {
  if (!config.ANTHROPIC_API_KEY) return null;
  const llm = new AnthropicLlm({ apiKey: config.ANTHROPIC_API_KEY });
  return new TurnEngine({
    llm,
    repo,
    retriever,
    tts,
    draw: buildDraw(config, images),
    judge: new ClaudeJudge({ llm, model: config.JUDGE_MODEL, repo, retriever, evidence }),
    prompts: loadPromptsSync(config.PROMPTS_DIR),
    models: { tutor: config.TUTOR_MODEL },
  });
}

export function createContainer(config: Config, overrides: Partial<Container> = {}): Container {
  const tts = "tts" in overrides ? (overrides.tts ?? null) : buildTts(config);
  const store = new MongoChunkStore();
  const repo =
    overrides.repo ??
    withCatalog(
      new InMemoryTurnRepository({
        catalog: [{ material_id: "demo-roma", title: "História de Roma (demo)", subject: "history", chapters: ["A República", "O Império"] }],
      }),
      () => store.listCatalog(),
      isMongoUp,
    );
  const images = overrides.images ?? new ImageStore(join(config.DATA_DIR, "files", "gen"));
  const evidence = overrides.evidence ?? new InMemoryEvidenceStore();
  const retriever = overrides.retriever ?? buildRetriever(config, store);
  const engine = "engine" in overrides ? (overrides.engine ?? null) : buildEngine(config, repo, tts, images, evidence, retriever);
  return { config, mongo: new MongoService(config.MONGODB_URI), mintSttToken, ...overrides, tts, repo, images, evidence, retriever, engine };
}
```

Append to `workstreams/contracts-spec.md`:

```markdown
## 13. Retrieval additions of 2026-10-30

Source of truth in code: `packages/contracts/src/{retrieval,chunk-store}.ts`. Design: `docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md` §6.1.

- `Repository.searchChunks({ query, k, material_id?, subject? }) → Chunk[]` replaces the old `searchChunks(material_id, query, k)`: the tutor searches **all** materials; `material_id` and `subject` are optional filters.
- `Chunk = { id, material_id, subject, chapter?, page, passage_idx, text, score? }` (a passage of ~400 tokens inside one page). `validateCitation(c)` is true when `c.quote` occurs on that page (whitespace- and case-insensitive).
- Ingestion (`@mento/sources/ingest`) stores passages with a 1024-dimension `embedding`; the catalog entry of each ready material is `{ material_id, title, subject, chapters: string[] }`.
- `createSession` no longer takes `material_id`, and `session_started` has no `material_id`.
```

- [ ] **Step 4: Run all checks**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: PASS. Without `VOYAGE_API_KEY` the container uses `emptyRetriever`, and without a Mongo connection the catalog falls back to the demo entry, so every earlier test still passes.

- [ ] **Step 5: Commit**

```bash
git add apps workstreams .env.example
git commit -m "feat(whiteboard): wire hybrid retrieval and the MongoDB catalog into the tutor"
```

---

### Task 6: The ingestion script and the Day-0 retrieval check

**Files:**
- Modify: `scripts/ingest.ts` (replace the stub), `scripts/package.json` (dependencies `@mento/db`, `@mento/sources`)
- Create: `scripts/retrieval-check.ts`, `fixtures/retrieval/questions.json`
- Modify: root `package.json` (script `retrieval:check`)

**Interfaces:**
- Consumes: `ingestPdf`, `parseChapters`, `createRetriever`, `embedWithVoyage`, `MongoChunkStore`, `ensureChunkIndexes`.
- Produces: `pnpm ingest <file.pdf> --title=… --subject=… [--chapters=…]`; `pnpm retrieval:check`.

- [ ] **Step 1: Add dependencies and the script entry**

Run: `pnpm --filter @mento/scripts add @mento/db@workspace:* @mento/sources@workspace:*`
In the root `package.json` `scripts` add: `"retrieval:check": "tsx scripts/retrieval-check.ts"`.

- [ ] **Step 2: Write the ingestion script**

Replace `scripts/ingest.ts`:

```ts
import { readFileSync } from "node:fs";
import { connectMongo, disconnectMongo, ensureChunkIndexes, MongoChunkStore } from "@mento/db";
import { embedWithVoyage } from "@mento/sources";
import { ingestPdf, parseChapters } from "@mento/sources/ingest";

process.loadEnvFile(new URL("../.env", import.meta.url));
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const title = arg("title");
const subject = arg("subject");
if (!file || !title || !subject) {
  console.error('usage: pnpm ingest <file.pdf> --title="História de Roma" --subject=history [--chapters="A República:1-40;O Império:41-90"]');
  process.exit(1);
}
const { MONGODB_URI, VOYAGE_API_KEY } = process.env;
if (!MONGODB_URI) throw new Error("MONGODB_URI is not set in .env");
if (!VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY is not set in .env");

await connectMongo(MONGODB_URI);
try {
  const created = await ensureChunkIndexes();
  if (created.length) console.log(`created search indexes: ${created.join(", ")} (Atlas builds them in the background; searches work once they are queryable)`);
  const report = await ingestPdf({
    data: readFileSync(file),
    title,
    subject,
    chapters: arg("chapters") ? parseChapters(arg("chapters") as string) : [],
    store: new MongoChunkStore(),
    embed: embedWithVoyage({ apiKey: VOYAGE_API_KEY }),
    log: (m) => console.log(m),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.empty_pages.length) console.log(`WARNING: ${report.empty_pages.length} page(s) have no text layer and are not searchable (they need OCR).`);
} finally {
  await disconnectMongo();
}
```

- [ ] **Step 3: Write the retrieval check**

Create `fixtures/retrieval/questions.json` (replace the questions with ones about pages of the real book; set `expect_page` to the page that answers it, or leave `null` to just print the top hits for a manual look):

```json
{
  "questions": [
    { "question": "Quando começou a República romana?", "expect_page": null },
    { "question": "Quem foi Augusto e por que ele é importante?", "expect_page": null },
    { "question": "Como os aquedutos levavam água às cidades?", "expect_page": null }
  ]
}
```

Create `scripts/retrieval-check.ts`:

```ts
import { readFileSync } from "node:fs";
import { connectMongo, disconnectMongo, MongoChunkStore } from "@mento/db";
import { createRetriever, embedWithVoyage } from "@mento/sources";

process.loadEnvFile(new URL("../.env", import.meta.url));
const { MONGODB_URI, VOYAGE_API_KEY } = process.env;
if (!MONGODB_URI || !VOYAGE_API_KEY) throw new Error("MONGODB_URI and VOYAGE_API_KEY must be set in .env");

const { questions } = JSON.parse(readFileSync(new URL("../fixtures/retrieval/questions.json", import.meta.url), "utf8")) as {
  questions: { question: string; expect_page: number | null }[];
};
const p50 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : NaN);

await connectMongo(MONGODB_URI);
try {
  const embedTimes: number[] = [];
  const base = embedWithVoyage({ apiKey: VOYAGE_API_KEY });
  const embed: typeof base = async (texts, type) => {
    const t0 = performance.now();
    const out = await base(texts, type);
    if (type === "query") embedTimes.push(performance.now() - t0);
    return out;
  };
  const retriever = createRetriever({ store: new MongoChunkStore(), embed, log: (m, e) => console.log("  !", m, e) });

  const totals: number[] = [];
  let judged = 0;
  let hits = 0;
  for (const { question, expect_page } of questions) {
    const t0 = performance.now();
    const chunks = await retriever.searchChunks({ query: question, k: 3 });
    const ms = performance.now() - t0;
    totals.push(ms);
    const pages = chunks.map((c) => c.page);
    const verdict = expect_page === null ? "" : pages.includes(expect_page) ? "  HIT" : "  MISS";
    if (expect_page !== null) {
      judged++;
      if (pages.includes(expect_page)) hits++;
    }
    console.log(`\n${question}  (${ms.toFixed(0)} ms)${verdict}`);
    for (const c of chunks) console.log(`  p.${c.page}${c.chapter ? ` · ${c.chapter}` : ""} · ${c.text.slice(0, 90).replace(/\s+/g, " ")}…`);
  }
  console.log(`\nsearch (embed + vector + text + fusion): p50 ${p50(totals).toFixed(0)} ms; query embedding alone: p50 ${p50(embedTimes).toFixed(0)} ms`);
  if (judged) console.log(`hit@3: ${hits}/${judged}`);
} finally {
  await disconnectMongo();
}
```

- [ ] **Step 4: Run them (needs Atlas, `VOYAGE_API_KEY` and the book PDF in `materials/`)**

Run: `pnpm ingest materials/<book>.pdf --title="<title>" --subject=history --chapters="<chapter:first-last;…>"`
Expected: `created search indexes: chunks_vector, chunks_text` the first time, then the page/passage counts and a JSON report; `empty_pages` should be `[]` for a text PDF (if not, the book needs OCR: tell the team).
Wait for both indexes to be queryable in the Atlas UI (Search & Vector Search tab: status Active, a minute or two), then:
Run: `pnpm retrieval:check`
Expected: for each question the top 3 passages and timings, then `search … p50` and `query embedding alone … p50`; with `expect_page` set, a `hit@3` score. Record the numbers (and the blind comparison of Voyage vs `gemini-embedding-2`, if you try it) in spec §11, Day-0 check 5.

- [ ] **Step 5: Commit**

```bash
git add scripts fixtures package.json pnpm-lock.yaml
git commit -m "feat(whiteboard): ingestion script and the Day-0 retrieval check"
```

---

## Self-review

- **Spec coverage (§6.1):** hybrid vector + text store with the two indexes and pre-filters → Task 4; Portuguese analyzer → Task 4 (`lucene.portuguese`, verify on Atlas); passages of ~400 tokens inside a page with chapter → Tasks 1, 3; Voyage `voyage-4` document/query embeddings → Task 2; `searchChunks` with fusion in application code and graceful degradation → Task 2; `validateCitation` against the page → Task 2; ingestion with an empty-page report (no Reducto) → Task 3; scripts and the Day-0 check (embed time, hit@3, text layer) → Task 6; catalog for the cache prefix and no `material_id` on sessions → Task 5 + contracts §13. Not here by design: OCR/Gemini fallback for pages without text (only if the real book needs it), the material upload route and UI (Person 1), the MongoDB `TurnRepository` (Person 1).
- **Placeholders:** none; the code in Tasks 1–4 was run (tests and type check) before being written here. Unverified without a real cluster: the Atlas pipelines and index definitions (covered by the skipped-by-default Atlas test and Task 6), the `lucene.portuguese` analyzer, and Voyage's Portuguese quality.
- **Type consistency:** `ChunkStore`, `PassageRecord`, `MaterialRecord`, `CatalogRecord`, `Embed`, `createRetriever`, `ingestPdf`, `IngestReport`, `MongoChunkStore`, `ensureChunkIndexes` and `withCatalog` are named identically across tasks and match Plan 3's `Retriever`, `Chunk`, `SearchQuery` and `TurnRepository`.
