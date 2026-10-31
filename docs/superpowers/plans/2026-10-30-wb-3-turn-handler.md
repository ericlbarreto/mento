# Whiteboard back-end, Plan 3: the turn handler (prompt, streaming tool calls, validation, events, routes)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/sessions/:id/turn` streams the tutor's script as validated `StreamMessage`s: each tool call is validated and emitted the moment its block closes, everything is persisted as events, and the tutor can search the teacher's materials, speak through the TTS service and trigger drawing and judging through small hooks that Plan 4 fills in.

**Architecture:** `packages/tutor` is pure orchestration with injected dependencies (`LlmClient`, `TurnRepository`, `Retriever`, `TtsStarter`, `DrawPipeline`, `Judge`). A `TurnEngine` runs one turn: load context in parallel, build a cache-friendly prompt, stream the LLM, pass every tool block through `prepareAction` (parse, fill server fields, validate against the board, sanitize, check citations) and `commitAction` (apply, emit, persist). A scripted fake LLM and an in-memory repository make every behavior testable without network access. `apps/api` exposes the routes and wires the real `AnthropicLlm`.

**Tech Stack:** TypeScript, Zod 4 (`z.toJSONSchema`), `@anthropic-ai/sdk`, Fastify 5, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md` (§2, §4 board ids, §6, §6.1, §8). Prerequisites: Plan 1 (contracts, `sendStreamMessage`) and Plan 2 (`TtsService` for the real TTS hook). Plan 4 provides the real draw pipeline and judge; Plan 5 the real `Retriever`.

## Global Constraints

- Tutor model `claude-sonnet-5-5` (env `TUTOR_MODEL`), judge `claude-haiku-5-5` (env `JUDGE_MODEL`); no extended thinking; `max_tokens` 2048.
- Prompt cache layout, in this order and never reordered: tools → system block 1 (base + all subject profiles + class context + learner summary) → system block 2 (catalog of materials, carries the single `cache_control: { type: "ephemeral" }` breakpoint) → one user message that holds everything that changes per turn (transcript, board snapshot, retrieved passages, new input). Tool definitions, `tool_choice` and thinking settings must not change during a session.
- Each turn is a stateless request: the previous turns are given as a text transcript inside the user message (no assistant tool-use history), except in the search round (§ Task 8).
- `eager_input_streaming: true` on `write_text`, `write_timeline` and `draw`.
- Element ids are chosen by the model (`ElementId` slug), actions get server ids `act_<turn>_<n>`, turns `turn_<n>`, verifications `ver_<n>`.
- The server never emits an action that fails Zod, the board rules or sanitizing; invalid blocks are dropped and logged, never forwarded.
- No student name in any prompt, transcript or log. Product-facing text (bridging speak, error messages) is Brazilian Portuguese; code and instructions are English.
- At most 2 LLM rounds per turn (the second only after a `search_materials` call). One retry on a retryable LLM error, only before any action was emitted. Bridging `speak` after `bridgeAfterMs` (default 3000) with no action.
- Packages never read environment variables; `apps/api/src/config.ts` passes plain options.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/contracts/src/retrieval.ts`, `sessions.ts` | `Chunk`, `SearchQuery`, `Retriever`; session create/end shapes |
| `packages/tutor/src/board.ts` | Board state, validation rules, snapshot |
| `packages/tutor/src/sanitize.ts` | HTML allowlist sanitizer |
| `packages/tutor/src/tools.ts` | Model-facing tool definitions from the contracts |
| `packages/tutor/src/tool-assembler.ts` | Accumulates streamed tool-call JSON into blocks |
| `prompts/base.md`, `prompts/subjects/history.md`, `prompts/subjects/generic.md` | Runtime tutor prompts |
| `packages/tutor/src/prompts.ts` | `loadPromptsSync` |
| `packages/tutor/src/prompt-builder.ts` | `buildSystem`, `buildUserMessage`, `historyFromEvents` |
| `packages/tutor/src/llm.ts` | `LlmClient` interface, events, `LlmError` |
| `packages/tutor/src/anthropic-llm.ts` | Real Anthropic implementation |
| `packages/tutor/src/repository.ts` | `TurnRepository` interface and data types |
| `packages/tutor/src/hooks.ts` | `TtsStarter`, `DrawPipeline`, `Judge` + no-op defaults |
| `packages/tutor/src/retrieval-step.ts` | Retrieval query, citation filtering |
| `packages/tutor/src/turn-runtime.ts` | Per-session runtime restore, ordered persistence queue |
| `packages/tutor/src/action-pipeline.ts` | `prepareAction`, `commitAction` |
| `packages/tutor/src/turn-engine.ts` | `TurnEngine` |
| `packages/tutor/src/testing/*` | `ScriptedLlm`, `InMemoryTurnRepository`, helpers (subpath `@mento/tutor/testing`) |
| `apps/api/src/routes/sessions.ts`, `turn.ts` | Create session, turn SSE, end session |
| `apps/api/src/container.ts`, `config.ts` | Wiring and settings |
| `scripts/llm-smoke.ts`, `scripts/turn-bench.ts` | Day-0 LLM check and latency report |

---

### Task 1: Retrieval and session contracts

**Files:**
- Create: `packages/contracts/src/retrieval.ts`
- Create: `packages/contracts/src/sessions.ts`
- Modify: `packages/contracts/src/index.ts` (add the two exports)
- Test: `packages/contracts/src/sessions.test.ts`

**Interfaces:**
- Produces: `Chunk`, `SearchQuery`, `Retriever { searchChunks(q): Promise<Chunk[]>; validateCitation(c): Promise<boolean> }`, `CreateSessionRequest`, `CreateSessionResponse`, `EndSessionRequest`.

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/sessions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Chunk, SearchQuery } from "./retrieval";
import { CreateSessionRequest, EndSessionRequest } from "./sessions";

describe("sessions", () => {
  it("creates a session from a student only (no material_id)", () => {
    expect(CreateSessionRequest.safeParse({ student_id: "stu_1", modality: "voice" }).success).toBe(true);
    expect(CreateSessionRequest.safeParse({ modality: "voice" }).success).toBe(false);
    expect(CreateSessionRequest.safeParse({ student_id: "stu_1", modality: "fax" }).success).toBe(false);
  });

  it("accepts the four end reasons", () => {
    for (const reason of ["user_left", "idle_timeout", "beacon", "manual"]) {
      expect(EndSessionRequest.safeParse({ reason }).success).toBe(true);
    }
    expect(EndSessionRequest.safeParse({ reason: "bored" }).success).toBe(false);
  });
});

describe("retrieval", () => {
  it("validates a chunk and bounds k", () => {
    const chunk = { id: "c1", material_id: "m1", subject: "history", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado..." };
    expect(Chunk.safeParse(chunk).success).toBe(true);
    expect(SearchQuery.safeParse({ query: "Augusto", k: 6 }).success).toBe(true);
    expect(SearchQuery.safeParse({ query: "Augusto", k: 0 }).success).toBe(false);
    expect(SearchQuery.safeParse({ query: "", k: 6 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/contracts test`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Write the implementation**

Create `packages/contracts/src/retrieval.ts`:

```ts
import { z } from "zod";
import type { Citation } from "./citation";

/** One passage (~300–500 tokens inside a single page) of a teacher material. */
export const Chunk = z.object({
  id: z.string().min(1),
  material_id: z.string().min(1),
  subject: z.string().min(1),
  chapter: z.string().optional(),
  page: z.number().int().min(1),
  passage_idx: z.number().int().min(0),
  text: z.string().min(1),
  score: z.number().optional(),
});
export type Chunk = z.infer<typeof Chunk>;

export const SearchQuery = z.object({
  query: z.string().min(1).max(500),
  k: z.number().int().min(1).max(12),
  material_id: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

/** Implemented by @mento/sources (Person 1, Plan 5); consumed by the tutor. The LLM never sees embeddings. */
export interface Retriever {
  searchChunks(q: SearchQuery): Promise<Chunk[]>;
  /** True when `c.quote` occurs in that material page. */
  validateCitation(c: Citation): Promise<boolean>;
}
```

Create `packages/contracts/src/sessions.ts`:

```ts
import { z } from "zod";

export const CreateSessionRequest = z.object({
  student_id: z.string().min(1),
  modality: z.enum(["text", "voice"]),
  topic: z.string().max(120).optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const CreateSessionResponse = z.object({ id: z.string().min(1) });
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

export const EndSessionRequest = z.object({ reason: z.enum(["user_left", "idle_timeout", "beacon", "manual"]) });
export type EndSessionRequest = z.infer<typeof EndSessionRequest>;
```

Add to `packages/contracts/src/index.ts`: `export * from "./retrieval";` and `export * from "./sessions";`.

- [ ] **Step 4: Run the test and the type check**

Run: `pnpm --filter @mento/contracts test && pnpm --filter @mento/contracts typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src
git commit -m "feat(whiteboard): retrieval and session contracts"
```

---

### Task 2: Board state, validation and sanitizing

**Files:**
- Create: `packages/tutor/src/board.ts`
- Create: `packages/tutor/src/sanitize.ts`
- Test: `packages/tutor/src/board.test.ts`, `packages/tutor/src/sanitize.test.ts`
- Modify: `packages/tutor/package.json` (add `zod` and `@anthropic-ai/sdk`; add the `./testing` export)

**Interfaces:**
- Consumes: `Action` from `@mento/contracts`.
- Produces: `Board` (`has`, `get`, `validate(action): Validation`, `apply(action)`, `snapshot(maxText?)`, `static fromActions(actions)`), `BoardElement`, `Validation`, `sanitizeHtml(html): string`.

- [ ] **Step 1: Add dependencies and the testing export**

Run: `pnpm --filter @mento/tutor add zod@^4.6.7 @anthropic-ai/sdk@^1.3.0`
Then edit `packages/tutor/package.json` so `exports` is:

```json
"exports": {
  ".": "./src/index.ts",
  "./testing": "./src/testing/index.ts"
}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/tutor/src/board.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Action } from "@mento/contracts";
import { Board } from "./board";

const writeText = (id: string, html: string, column: "main" | "visuals" | "side" = "main"): Action => ({ id: `act_${id}`, name: "write_text", args: { id, column, html } });
const timeline = (id: string): Action => ({
  id: `act_${id}`, name: "write_timeline",
  args: { id, column: "main", events: [{ date: "509 a.C.", label: "Início da República" }, { date: "27 a.C.", label: "Otávio vira Augusto" }] },
});

describe("Board.validate", () => {
  it("accepts a new element and rejects a duplicate id", () => {
    const board = new Board();
    const a = writeText("title", "<h1>Roma</h1>");
    expect(board.validate(a)).toEqual({ ok: true });
    board.apply(a);
    expect(board.validate(writeText("title", "<p>outro</p>"))).toMatchObject({ ok: false });
  });

  it("requires highlight and circle targets to exist, and the circled text to occur in them", () => {
    const board = new Board();
    board.apply(timeline("tl"));
    const highlight = (target_id: string): Action => ({ id: "h", name: "highlight", args: { target_id, color: "yellow" } });
    expect(board.validate(highlight("tl"))).toEqual({ ok: true });
    expect(board.validate(highlight("nope"))).toMatchObject({ ok: false });

    const circle = (text_to_match: string): Action => ({ id: "c", name: "circle_annotate", args: { target_id: "tl", text_to_match, color: "red" } });
    expect(board.validate(circle("27 a.C."))).toEqual({ ok: true });
    expect(board.validate(circle("27 A.C."))).toEqual({ ok: true }); // case-insensitive
    expect(board.validate(circle("476 d.C."))).toMatchObject({ ok: false });
  });

  it("only lets update_element change text elements, and remove_element needs an existing id", () => {
    const board = new Board();
    board.apply(writeText("nota", "<p>antes</p>"));
    board.apply(timeline("tl"));
    expect(board.validate({ id: "u", name: "update_element", args: { id: "nota", html: "<p>depois</p>" } })).toEqual({ ok: true });
    expect(board.validate({ id: "u", name: "update_element", args: { id: "tl", html: "<p>x</p>" } })).toMatchObject({ ok: false });
    expect(board.validate({ id: "r", name: "remove_element", args: { id: "ghost" } })).toMatchObject({ ok: false });
  });

  it("never accepts draw_result from the model", () => {
    const board = new Board();
    expect(board.validate({ id: "d", name: "draw_result", args: { element_id: "colosseum", url: "/x.jpg" } })).toMatchObject({ ok: false });
  });
});

describe("Board.apply, snapshot and fromActions", () => {
  it("updates and removes elements and lists them in a compact snapshot", () => {
    const board = new Board();
    board.apply(writeText("title", "<h1>Da República</h1>"));
    board.apply({ id: "d", name: "draw", args: { id: "colosseum", column: "visuals", prompt: "Coliseu", is_structured: false, max_dimensions: { w: 500, h: 400 } } });
    board.apply({ id: "u", name: "update_element", args: { id: "title", html: "<h1>Ao Império</h1>" } });
    expect(board.snapshot()).toBe("title | text | main | Ao Império\ncolosseum | image | visuals | Coliseu");
    board.apply({ id: "r", name: "remove_element", args: { id: "colosseum" } });
    expect(board.has("colosseum")).toBe(false);
    expect(new Board().snapshot()).toBe("(the board is empty)");
  });

  it("truncates long text in the snapshot and rebuilds from a list of actions, skipping invalid ones", () => {
    const long = "x".repeat(300);
    const board = Board.fromActions([writeText("a", `<p>${long}</p>`), { id: "h", name: "highlight", args: { target_id: "ghost", color: "pink" } }]);
    expect(board.has("a")).toBe(true);
    expect(board.snapshot(20)).toBe(`a | text | main | ${"x".repeat(19)}…`);
  });
});
```

Create `packages/tutor/src/sanitize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("keeps the allowlisted tags and drops their attributes", () => {
    expect(sanitizeHtml('<h1 class="x" onclick="evil()">Roma</h1><p style="color:red">Oi <b>você</b></p>')).toBe("<h1>Roma</h1><p>Oi <b>você</b></p>");
  });

  it("removes scripts, styles, comments and tags outside the allowlist but keeps their text", () => {
    expect(sanitizeHtml('<p>a</p><script>alert(1)</script><style>p{}</style><!-- c --><img src=x onerror=y><a href="javascript:z">link</a>')).toBe("<p>a</p>link");
  });

  it("normalizes br and leaves plain text and comparisons untouched", () => {
    expect(sanitizeHtml("linha<br/>dois e 3 < 5")).toBe("linha<br>dois e 3 < 5");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @mento/tutor test`
Expected: FAIL (modules do not exist).

- [ ] **Step 4: Write the implementation**

Create `packages/tutor/src/sanitize.ts`:

```ts
const ALLOWED = new Set(["h1", "h2", "h3", "p", "b", "i", "br", "ul", "ol", "li", "span"]);

/** Allowlist sanitizer for model HTML: keeps only simple formatting tags and strips every attribute. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match: string, tag: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED.has(t)) return "";
      if (match.startsWith("</")) return `</${t}>`;
      return t === "br" ? "<br>" : `<${t}>`;
    });
}
```

Create `packages/tutor/src/board.ts`:

```ts
import type { Action } from "@mento/contracts";

export type ElementType = "text" | "timeline" | "image" | "question";

export interface BoardElement {
  id: string;
  type: ElementType;
  column: string;
  text: string;
}

export type Validation = { ok: true } | { ok: false; reason: string };

const OK: Validation = { ok: true };
const fail = (reason: string): Validation => ({ ok: false, reason });

const stripTags = (html: string): string =>
  html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const norm = (s: string): string => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");

function created(action: Action): BoardElement | null {
  switch (action.name) {
    case "write_text":
      return { id: action.args.id, type: "text", column: action.args.column, text: stripTags(action.args.html) };
    case "write_timeline":
      return {
        id: action.args.id,
        type: "timeline",
        column: action.args.column,
        text: action.args.events.map((e) => `${e.date} ${e.label}`).join(" · "),
      };
    case "draw":
      return { id: action.args.id, type: "image", column: action.args.column, text: action.args.prompt };
    case "ask_verification":
      return { id: action.args.id, type: "question", column: action.args.column, text: action.args.question };
    default:
      return null;
  }
}

/** The board as the server knows it: rebuilt from `tutor_action` events, used to validate every new action. */
export class Board {
  private readonly elements = new Map<string, BoardElement>();

  has(id: string): boolean {
    return this.elements.has(id);
  }

  get(id: string): BoardElement | undefined {
    return this.elements.get(id);
  }

  validate(action: Action): Validation {
    switch (action.name) {
      case "speak":
        return OK;
      case "write_text":
      case "write_timeline":
      case "draw":
      case "ask_verification":
        return this.elements.has(action.args.id) ? fail(`duplicate element id: ${action.args.id}`) : OK;
      case "highlight":
        return this.elements.has(action.args.target_id) ? OK : fail(`unknown target: ${action.args.target_id}`);
      case "circle_annotate": {
        const target = this.elements.get(action.args.target_id);
        if (!target) return fail(`unknown target: ${action.args.target_id}`);
        return norm(target.text).includes(norm(action.args.text_to_match))
          ? OK
          : fail(`text_to_match not found in ${action.args.target_id}`);
      }
      case "update_element": {
        const target = this.elements.get(action.args.id);
        if (!target) return fail(`unknown element: ${action.args.id}`);
        return target.type === "text" ? OK : fail(`only text elements can be updated: ${action.args.id}`);
      }
      case "remove_element":
        return this.elements.has(action.args.id) ? OK : fail(`unknown element: ${action.args.id}`);
      case "draw_result":
        return fail("draw_result is server-only");
    }
  }

  apply(action: Action): void {
    const el = created(action);
    if (el) {
      this.elements.set(el.id, el);
    } else if (action.name === "update_element") {
      const target = this.elements.get(action.args.id);
      if (target) target.text = stripTags(action.args.html);
    } else if (action.name === "remove_element") {
      this.elements.delete(action.args.id);
    }
  }

  /** One compact line per element: `id | type | column | text` (given to the model every turn). */
  snapshot(maxText = 120): string {
    if (this.elements.size === 0) return "(the board is empty)";
    return [...this.elements.values()]
      .map((e) => `${e.id} | ${e.type} | ${e.column} | ${e.text.length > maxText ? `${e.text.slice(0, maxText - 1)}…` : e.text}`)
      .join("\n");
  }

  static fromActions(actions: Action[]): Board {
    const board = new Board();
    for (const a of actions) if (board.validate(a).ok) board.apply(a);
    return board;
  }
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `pnpm --filter @mento/tutor test && pnpm --filter @mento/tutor typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/tutor pnpm-lock.yaml
git commit -m "feat(whiteboard): board state with validation rules and HTML sanitizer"
```

---

### Task 3: Model tools and the tool-call assembler

**Files:**
- Create: `packages/tutor/src/tools.ts`
- Create: `packages/tutor/src/tool-assembler.ts`
- Test: `packages/tutor/src/tools.test.ts`, `packages/tutor/src/tool-assembler.test.ts`

**Interfaces:**
- Consumes: `SpeakBase`, `WriteTextBase`, `WriteTimelineArgs`, `HighlightArgs`, `CircleAnnotateArgs`, `DrawArgs`, `UpdateElementArgs`, `RemoveElementArgs`, `AskVerificationBase` from `@mento/contracts`.
- Produces: `ToolDef { name; description; input_schema; eager_input_streaming? }`, `modelTools(): ToolDef[]`, `SearchMaterialsArgs`, `ToolBlock { id; name; raw_input }`, `RawStreamEvent`, `ToolBlockAssembler.push(event): ToolBlock[]`.

- [ ] **Step 1: Write the failing tests**

Create `packages/tutor/src/tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SearchMaterialsArgs, modelTools } from "./tools";

describe("modelTools", () => {
  const tools = modelTools();
  const byName = (n: string) => tools.find((t) => t.name === n);

  it("lists the tutor tools in a fixed order (prompt-cache stability)", () => {
    expect(tools.map((t) => t.name)).toEqual([
      "speak", "write_text", "write_timeline", "highlight", "circle_annotate",
      "draw", "update_element", "remove_element", "ask_verification", "search_materials",
    ]);
    expect(JSON.stringify(modelTools())).toBe(JSON.stringify(tools));
  });

  it("gives every tool an object schema and a description", () => {
    for (const t of tools) {
      expect(t.input_schema.type).toBe("object");
      expect(t.description.length).toBeGreaterThan(40);
    }
  });

  it("hides server-filled fields from the model", () => {
    const speak = JSON.stringify(byName("speak")?.input_schema);
    expect(speak).not.toContain("audio_url");
    const ask = JSON.stringify(byName("ask_verification")?.input_schema);
    expect(ask).not.toContain("verification_id");
    expect(ask).not.toContain("concept_key");
    expect(JSON.stringify(tools)).not.toContain("draw_result");
  });

  it("turns on eager input streaming only for the large tools", () => {
    expect(tools.filter((t) => t.eager_input_streaming).map((t) => t.name)).toEqual(["write_text", "write_timeline", "draw"]);
  });

  it("validates search_materials arguments", () => {
    expect(SearchMaterialsArgs.safeParse({ query: "fim da república" }).success).toBe(true);
    expect(SearchMaterialsArgs.safeParse({ query: "x", k: 20 }).success).toBe(false);
  });
});
```

Create `packages/tutor/src/tool-assembler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ToolBlockAssembler, type RawStreamEvent } from "./tool-assembler";

const start = (index: number, id: string, name: string): RawStreamEvent => ({ type: "content_block_start", index, content_block: { type: "tool_use", id, name } });
const delta = (index: number, partial_json: string): RawStreamEvent => ({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json } });
const stop = (index: number): RawStreamEvent => ({ type: "content_block_stop", index });

function run(events: RawStreamEvent[]) {
  const asm = new ToolBlockAssembler();
  return events.flatMap((e) => asm.push(e));
}

describe("ToolBlockAssembler", () => {
  it("joins partial JSON fragments and emits a block only when it closes", () => {
    const asm = new ToolBlockAssembler();
    expect(asm.push(start(0, "toolu_1", "speak"))).toEqual([]);
    expect(asm.push(delta(0, '{"text": "Ol'))).toEqual([]);
    expect(asm.push(delta(0, 'á!"}'))).toEqual([]);
    expect(asm.push(stop(0))).toEqual([{ id: "toolu_1", name: "speak", raw_input: '{"text": "Olá!"}' }]);
  });

  it("ignores text blocks and keeps several tool blocks in order", () => {
    const blocks = run([
      { type: "content_block_start", index: 0, content_block: { type: "text" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta" } },
      stop(0),
      start(1, "t1", "write_text"), delta(1, '{"id":"title"'), delta(1, ',"column":"main","html":"<h1>x</h1>"}'), stop(1),
      start(2, "t2", "speak"), delta(2, '{"text":"oi"}'), stop(2),
    ]);
    expect(blocks.map((b) => b.name)).toEqual(["write_text", "speak"]);
    expect(JSON.parse(blocks[0]!.raw_input)).toEqual({ id: "title", column: "main", html: "<h1>x</h1>" });
  });

  it("uses an empty object for a tool call without arguments and passes truncated JSON through unparsed", () => {
    expect(run([start(0, "t", "remove_element"), stop(0)])[0]?.raw_input).toBe("{}");
    const cut = run([start(0, "t", "speak"), delta(0, '{"text": "inter'), stop(0)])[0];
    expect(() => JSON.parse(cut!.raw_input)).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mento/tutor test`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Write the implementation**

Create `packages/tutor/src/tool-assembler.ts`:

```ts
/** The few fields of Anthropic stream events the assembler reads (kept structural so any SDK version fits). */
export interface RawStreamEvent {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string };
  delta?: { type: string; partial_json?: string };
}

/** A tool call whose input JSON is complete (`raw_input` may still be invalid JSON if the model was cut off). */
export interface ToolBlock {
  id: string;
  name: string;
  raw_input: string;
}

/** Accumulates `input_json_delta` fragments per content block and emits each tool call when its block stops. */
export class ToolBlockAssembler {
  private readonly open = new Map<number, { id: string; name: string; parts: string[] }>();

  push(event: RawStreamEvent): ToolBlock[] {
    const index = event.index;
    if (index === undefined) return [];
    if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
      this.open.set(index, { id: event.content_block.id ?? "", name: event.content_block.name ?? "", parts: [] });
      return [];
    }
    if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
      this.open.get(index)?.parts.push(event.delta.partial_json ?? "");
      return [];
    }
    if (event.type === "content_block_stop") {
      const block = this.open.get(index);
      if (!block) return [];
      this.open.delete(index);
      return [{ id: block.id, name: block.name, raw_input: block.parts.join("") || "{}" }];
    }
    return [];
  }
}
```

Create `packages/tutor/src/tools.ts`:

```ts
import { z } from "zod";
import {
  AskVerificationBase,
  CircleAnnotateArgs,
  DrawArgs,
  HighlightArgs,
  RemoveElementArgs,
  SpeakBase,
  UpdateElementArgs,
  WriteTextBase,
  WriteTimelineArgs,
} from "@mento/contracts";

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  eager_input_streaming?: boolean;
}

export const SearchMaterialsArgs = z.object({
  query: z.string().min(1).max(300),
  material_id: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  k: z.number().int().min(1).max(8).optional(),
});
export type SearchMaterialsArgs = z.infer<typeof SearchMaterialsArgs>;

const jsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  return rest;
};

/**
 * Tools the tutor model may call, derived from the contracts so the model and the front-end cannot drift.
 * The order and the text are part of the prompt-cache prefix: change them deliberately.
 */
export function modelTools(): ToolDef[] {
  return [
    {
      name: "speak",
      description:
        "Say something to the student, in Brazilian Portuguese. In voice mode it is spoken aloud, so use one or two short sentences and put details on the board. Set purpose to 'hint' (with hint_level 1-3) whenever you give a hint on an open question. Cite the teacher's material in sources; set outside_material to true when you go beyond it.",
      input_schema: jsonSchema(SpeakBase),
    },
    {
      name: "write_text",
      description:
        "Write a handwritten-style text block on the board. Allowed HTML: h1-h3, p, b, i, br, ul, ol, li, span. Choose a column (main, visuals or side), never coordinates. The id must be new, short, snake_case and unique in the session. Use purpose and hint_level like speak.",
      input_schema: jsonSchema(WriteTextBase),
      eager_input_streaming: true,
    },
    {
      name: "write_timeline",
      description:
        "Write a timeline with exact dates on the board. Always use this for chronology instead of drawing dates. The id must be new and unique.",
      input_schema: jsonSchema(WriteTimelineArgs),
      eager_input_streaming: true,
    },
    {
      name: "highlight",
      description: "Highlight an element that already exists on the board. target_id must be an id listed in the Board section of the input.",
      input_schema: jsonSchema(HighlightArgs),
    },
    {
      name: "circle_annotate",
      description:
        "Circle a piece of text inside an element that already exists. target_id must be an existing element id and text_to_match must occur in that element's text.",
      input_schema: jsonSchema(CircleAnnotateArgs),
    },
    {
      name: "draw",
      description:
        "Add an illustration to the board. With is_structured=false it is an artistic colored-pencil image; describe only the picture and never ask for text, labels or dates inside it (use write_text for labels). The id must be new and unique.",
      input_schema: jsonSchema(DrawArgs),
      eager_input_streaming: true,
    },
    {
      name: "update_element",
      description: "Replace the content of an existing text element (write_text) by id.",
      input_schema: jsonSchema(UpdateElementArgs),
    },
    {
      name: "remove_element",
      description: "Remove an existing element from the board by id.",
      input_schema: jsonSchema(RemoveElementArgs),
    },
    {
      name: "ask_verification",
      description:
        "Put a question for the student on the board to check understanding, then stop and wait for the answer. concept is a short pt-BR label: reuse the label of one of the student's open gaps, then a chapter title from the catalog, otherwise a new short label. kind: explain in own words, transfer to a new case, or place an event on the timeline.",
      input_schema: jsonSchema(AskVerificationBase),
    },
    {
      name: "search_materials",
      description:
        "Search the teacher's materials for passages. Use it only when the passages already given in the input are not enough, and first say a short speak such as 'Vou conferir no livro.'. At most once per reply.",
      input_schema: jsonSchema(SearchMaterialsArgs),
    },
  ];
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/tutor test && pnpm --filter @mento/tutor typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tutor
git commit -m "feat(whiteboard): model tool definitions and streamed tool-call assembler"
```

---

### Task 4: Prompts and the prompt builder

**Files:**
- Create: `prompts/base.md`, `prompts/subjects/history.md`, `prompts/subjects/generic.md`
- Create: `packages/tutor/src/prompts.ts`
- Create: `packages/tutor/src/prompt-builder.ts`
- Test: `packages/tutor/src/prompts.test.ts`, `packages/tutor/src/prompt-builder.test.ts`

**Interfaces:**
- Consumes: `Chunk`, `TurnRequest`, `Event` from `@mento/contracts`.
- Produces: `PromptSet { base; subjects }`, `loadPromptsSync(dir)`, `ClassContext`, `LearnerSummary`, `CatalogEntry`, `SystemBlock`, `buildSystem(input): SystemBlock[]`, `buildUserMessage(input): string`, `historyFromEvents(events, limit?)`, `formatPassages(chunks)`.

- [ ] **Step 1: Write the prompt files**

Create `prompts/base.md`:

```markdown
# Mento tutor: base instructions

You are Mento, an AI tutor for students in Brazilian schools (Ensino Fundamental II, 7º to 9º ano). You teach one student at a time on a shared whiteboard, by talking and by writing and drawing on it.

## Language and tone
- Always speak and write to the student in Brazilian Portuguese (pt-BR). These instructions are in English; your output is not.
- Be warm, clear and brief. Short sentences. Use examples a 12 to 14 year old can relate to. Never talk down to the student.
- In voice mode keep each `speak` to one or two short sentences and put the details on the board.

## How you act
You act only by calling tools. Never write plain text outside tool calls.
1. Start every reply with a one-sentence `speak` and a title with `write_text`, so the student sees and hears something within a second.
2. Then continue in small steps: one idea at a time, alternating speak, board and questions.
3. Give every new board element a new short snake_case `id` and a `column` (main, visuals or side). Never use coordinates. Never reuse an id; to change an element use `update_element`.
4. You may only highlight or circle elements that exist (see the Board section of the input), and the text you circle must appear in that element.
5. Use `write_timeline` for dates, never an image. Use `draw` only for illustrations without any text inside.
6. Check understanding with `ask_verification` (explain in own words, transfer to a new case, or place an event on the timeline). After asking, stop and wait for the answer.
7. In the opening turn (no student message yet) greet the student, and ask what they want to study today, suggesting up to three topics from the catalog and from their open gaps.

## Grounding and honesty
- Teach from the passages of the teacher's materials given in the input. Cite them: copy `material_id` and `page` exactly, and a short exact `quote` (at most 25 words) from the passage. Never invent a citation.
- If the passages do not support what you are about to say, you may still help, but set `outside_material` to true on that action.
- If you need more material, first say a short `speak` ("Vou conferir no livro.") and then call `search_materials`. Do this at most once per reply.

## Hints
- When the student is stuck on an open question, give a hint instead of the answer. Set `purpose` to "hint" and `hint_level` to 1 (gentle nudge), 2 (narrow it down) or 3 (almost the answer).
- Praise effort and specific progress, not the person.

## Concept labels
For `ask_verification`, `concept` is a short pt-BR label (at most 60 characters). Reuse, in this order: the label of one of the student's open gaps; the title of a chapter in the catalog; otherwise a new short label.

## Safety and privacy
- Never ask for or repeat personal data. Never guess the student's personality, attention, emotions or learning style: talk only about what they did on the tasks.
- The class description from the teacher is guidance, not fact. Adapt vocabulary and examples to the grade level.
```

Create `prompts/subjects/history.md`:

```markdown
# Subject profile: history

- Place every event in time: give the date or period and connect it to what came before and after. Prefer `write_timeline` for chronology.
- Teach cause and consequence, not lists of facts. Ask "why did this happen?" and "what changed?".
- Separate what the sources say from interpretation. The teacher's material is the source of truth; cite it.
- Avoid anachronisms and do not judge the past by today's values; explain the context first.
- Illustrate places, buildings and objects (for example the Colosseum, an aqueduct, a legionary) with `draw`; never put dates or names inside images.
- Ancient Rome (demo topics): the periods (Monarquia, República, Império), key people (Júlio César, Otávio/Augusto), institutions (Senado, cônsules), daily life and engineering.
```

Create `prompts/subjects/generic.md`:

```markdown
# Subject profile: generic

- Start from what the student already knows: ask one short question before explaining.
- Explain one idea at a time with a concrete example, then ask the student to restate or apply it.
- Prefer the board for structure (lists, timelines, short definitions) and speech for the explanation.
- When the subject is not covered by a specific profile, follow the teacher's material and its vocabulary.
```

- [ ] **Step 2: Write the failing tests**

Create `packages/tutor/src/prompts.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPromptsSync } from "./prompts";

describe("loadPromptsSync", () => {
  it("reads the base prompt and every subject profile of the repository", () => {
    const set = loadPromptsSync(fileURLToPath(new URL("../../../prompts", import.meta.url)));
    expect(set.base).toContain("Brazilian Portuguese");
    expect(Object.keys(set.subjects).sort()).toEqual(["generic", "history"]);
    expect(set.subjects.history).toContain("Place every event in time");
  });
});
```

Create `packages/tutor/src/prompt-builder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Event } from "@mento/contracts";
import { buildSystem, buildUserMessage, historyFromEvents, type CatalogEntry } from "./prompt-builder";

const prompts = { base: "BASE", subjects: { history: "HISTORY PROFILE", generic: "GENERIC PROFILE" } };
const catalog: CatalogEntry[] = [{ material_id: "m1", title: "História de Roma", subject: "history", chapters: ["A República", "O Império"] }];
const summary = {
  open_gaps: [{ concept: "Fim da República", concept_key: "fim da republica", description: "Confunde República e Império", confidence: 0.6 }],
  recent_progress: [],
};

describe("buildSystem", () => {
  const blocks = buildSystem({ prompts, classContext: { grade_level: "8º ano", description: "Turma participativa" }, summary, catalog });

  it("puts everything stable in two blocks and a single cache breakpoint at the end", () => {
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.cache_control).toBeUndefined();
    expect(blocks[1]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("includes the base prompt, every subject profile, the class context, the open gaps and the catalog", () => {
    const first = blocks[0]!.text;
    expect(first).toContain("BASE");
    expect(first).toContain("HISTORY PROFILE");
    expect(first).toContain("GENERIC PROFILE");
    expect(first).toContain("8º ano");
    expect(first).toContain("Turma participativa");
    expect(first).toContain("Fim da República (fim da republica)");
    expect(blocks[1]!.text).toContain("m1 | História de Roma | history | A República; O Império");
  });

  it("says so when there are no gaps and no materials", () => {
    const empty = buildSystem({ prompts, classContext: { grade_level: "7º ano", description: "" }, summary: { open_gaps: [], recent_progress: [] }, catalog: [] });
    expect(empty[0]!.text).toContain("No open gaps recorded yet.");
    expect(empty[1]!.text).toContain("(no materials uploaded yet)");
  });
});

describe("buildUserMessage", () => {
  const base = { modality: "voice" as const, history: [], boardSnapshot: "(the board is empty)", passages: [] };

  it("describes the opening turn when there is no input", () => {
    const text = buildUserMessage({ ...base, appended: [] });
    expect(text).toContain("The conversation is starting");
    expect(text).toContain("(none retrieved)");
  });

  it("includes the student message, the selection, the passages, the transcript and the board", () => {
    const text = buildUserMessage({
      modality: "text",
      history: [{ role: "student", text: "Oi" }, { role: "tutor", text: "Olá!" }],
      boardSnapshot: "tl | timeline | main | 27 a.C. Otávio vira Augusto",
      passages: [{ id: "c1", material_id: "m1", subject: "history", chapter: "O Império", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado..." }],
      appended: [{ name: "user_message", kind: "board_select", text: "O que é isso?", selected: { element_id: "tl", text: "27 a.C." } }],
    });
    expect(text).toContain("Aluno: Oi");
    expect(text).toContain("Tutor: Olá!");
    expect(text).toContain("tl | timeline | main | 27 a.C.");
    expect(text).toContain("[m1 · p.12 · O Império]\nEm 27 a.C., o Senado...");
    expect(text).toContain('The student said (text): "O que é isso?"');
    expect(text).toContain('The student selected on the board: tl ("27 a.C.")');
    expect(text).not.toContain("The conversation is starting");
  });

  it("reports an answer to a verification and an interruption", () => {
    const text = buildUserMessage({
      ...base,
      appended: [{ name: "verification_answer", verification_id: "ver_1", element_id: "q_augusto", answer: "Mudou o governo" }],
      interrupted: { turn_id: "turn_2", action_id: "act_2_3", spoken_chars: 40, spoken_ms: 2100 },
    });
    expect(text).toContain('The student answered the question q_augusto (ver_1): "Mudou o governo"');
    expect(text).toContain("The student interrupted you after about 40 characters of your last reply");
  });
});

describe("historyFromEvents", () => {
  const ev = (type: Event["type"], payload: unknown, n: number): Event => ({ id: String(n), session_id: "s", ts: "2026-10-30T21:00:00.000Z", type, payload });

  it("builds the transcript from student messages, answers and tutor speech, newest last, limited", () => {
    const events = [
      ev("session_started", {}, 1),
      ev("tutor_action", { name: "speak", args: { text: "Olá!" } }, 2),
      ev("tutor_action", { name: "write_text", args: { html: "<h1>x</h1>" } }, 3),
      ev("user_message", { text: "Oi" }, 4),
      ev("verification_answered", { answer: "Foi em 27 a.C." }, 5),
    ];
    expect(historyFromEvents(events)).toEqual([
      { role: "tutor", text: "Olá!" },
      { role: "student", text: "Oi" },
      { role: "student", text: "Foi em 27 a.C." },
    ]);
    expect(historyFromEvents(events, 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @mento/tutor test`
Expected: FAIL (modules do not exist).

- [ ] **Step 4: Write the implementation**

Create `packages/tutor/src/prompts.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export interface PromptSet {
  base: string;
  /** Subject profile text by subject key (file name without .md). */
  subjects: Record<string, string>;
}

/** Read `base.md` and `subjects/*.md` once at startup. */
export function loadPromptsSync(dir: string): PromptSet {
  const base = readFileSync(join(dir, "base.md"), "utf8");
  const subjectsDir = join(dir, "subjects");
  const subjects: Record<string, string> = {};
  for (const file of readdirSync(subjectsDir).filter((f) => f.endsWith(".md")).sort()) {
    subjects[basename(file, ".md")] = readFileSync(join(subjectsDir, file), "utf8");
  }
  return { base, subjects };
}
```

Create `packages/tutor/src/prompt-builder.ts`:

```ts
import type { Chunk, Event, TurnRequest } from "@mento/contracts";
import type { PromptSet } from "./prompts";

export interface ClassContext {
  grade_level: string;
  description: string;
}
export interface LearnerSummary {
  open_gaps: { concept: string; concept_key: string; description: string; confidence: number }[];
  recent_progress: { concept: string; description: string }[];
}
export interface CatalogEntry {
  material_id: string;
  title: string;
  subject: string;
  chapters: string[];
}
export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

/**
 * The stable prefix: system block 1 (base, all subject profiles, class, learner summary) and block 2
 * (material catalog) which carries the single cache breakpoint. Nothing here may change within a session.
 */
export function buildSystem(input: {
  prompts: PromptSet;
  classContext: ClassContext;
  summary: LearnerSummary;
  catalog: CatalogEntry[];
}): SystemBlock[] {
  const { prompts, classContext, summary, catalog } = input;
  const profiles = Object.entries(prompts.subjects)
    .map(([key, text]) => `### ${key}\n${text}`)
    .join("\n\n");
  const gaps = summary.open_gaps.length
    ? summary.open_gaps.map((g) => `- ${g.concept} (${g.concept_key}): ${g.description} [confidence ${g.confidence.toFixed(2)}]`).join("\n")
    : "No open gaps recorded yet.";
  const progress = summary.recent_progress.length
    ? summary.recent_progress.map((p) => `- ${p.concept}: ${p.description}`).join("\n")
    : "No recent progress recorded yet.";

  const first = [
    prompts.base.trim(),
    `## Subject profiles\nApply the profile that matches the topic being taught.\n\n${profiles}`,
    `## Class\nGrade level: ${classContext.grade_level}\nTeacher's description (guidance, not fact): ${classContext.description || "(none)"}`,
    `## This student\nOpen gaps (reuse these labels in ask_verification):\n${gaps}\n\nRecent progress:\n${progress}`,
  ].join("\n\n");

  const rows = catalog.length
    ? catalog.map((m) => `${m.material_id} | ${m.title} | ${m.subject} | ${m.chapters.join("; ")}`).join("\n")
    : "(no materials uploaded yet)";
  const second = `## Catalog of the teacher's materials\nmaterial_id | title | subject | chapters\n${rows}`;

  return [
    { type: "text", text: first },
    { type: "text", text: second, cache_control: { type: "ephemeral" } },
  ];
}

export function formatPassages(chunks: Chunk[]): string {
  if (chunks.length === 0) return "(none retrieved)";
  return chunks.map((c) => `[${c.material_id} · p.${c.page}${c.chapter ? ` · ${c.chapter}` : ""}]\n${c.text}`).join("\n\n");
}

export interface UserMessageInput {
  modality: "text" | "voice";
  history: { role: "student" | "tutor"; text: string }[];
  boardSnapshot: string;
  passages: Chunk[];
  appended: TurnRequest["appended"];
  interrupted?: TurnRequest["interrupted"];
}

/** Everything that changes per turn, as one user message (kept after the cache breakpoint). */
export function buildUserMessage(input: UserMessageInput): string {
  const transcript = input.history.length
    ? input.history.map((h) => `${h.role === "student" ? "Aluno" : "Tutor"}: ${h.text}`).join("\n")
    : "(no previous messages)";

  const lines: string[] = [];
  for (const a of input.appended) {
    if (a.name === "user_message") {
      lines.push(`The student said (${a.kind === "speech" ? "voice" : "text"}): "${a.text}"`);
      if (a.selected) {
        lines.push(`The student selected on the board: ${a.selected.element_id}${a.selected.text ? ` ("${a.selected.text}")` : ""}`);
      }
    } else {
      lines.push(`The student answered the question ${a.element_id} (${a.verification_id}): "${a.answer}"`);
    }
  }
  if (input.interrupted) {
    const chars = input.interrupted.spoken_chars;
    lines.push(`The student interrupted you${chars !== undefined ? ` after about ${chars} characters of your last reply` : ""}. React to what they said, do not repeat what you already said.`);
  }
  if (lines.length === 0) {
    lines.push("The conversation is starting. Greet the student and ask what they want to study today, suggesting up to three topics from the catalog and the open gaps.");
  }

  const modality =
    input.modality === "voice"
      ? "Voice mode: replies are spoken aloud, so keep each speak to one or two short sentences."
      : "Text mode: replies are read on screen.";

  return [
    `## Conversation so far\n${transcript}`,
    `## Board\n${input.boardSnapshot}`,
    `## Passages from the teacher's materials\n${formatPassages(input.passages)}`,
    `## New input\n${lines.join("\n")}`,
    `## Modality\n${modality}`,
  ].join("\n\n");
}

/** Transcript lines from the event log: student messages and answers, and the tutor's spoken text. */
export function historyFromEvents(events: Event[], limit = 12): { role: "student" | "tutor"; text: string }[] {
  const lines: { role: "student" | "tutor"; text: string }[] = [];
  for (const e of events) {
    const p = e.payload as Record<string, unknown> | null;
    if (!p) continue;
    if (e.type === "user_message" && typeof p.text === "string") lines.push({ role: "student", text: p.text });
    else if (e.type === "verification_answered" && typeof p.answer === "string") lines.push({ role: "student", text: p.answer });
    else if (e.type === "tutor_action" && p.name === "speak") {
      const text = (p.args as { text?: unknown } | undefined)?.text;
      if (typeof text === "string") lines.push({ role: "tutor", text });
    }
  }
  return lines.slice(-limit);
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `pnpm --filter @mento/tutor test && pnpm --filter @mento/tutor typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prompts packages/tutor
git commit -m "feat(whiteboard): tutor prompts and cache-friendly prompt builder"
```

---

### Task 5: LLM interface, scripted fake and the Anthropic client

**Files:**
- Create: `packages/tutor/src/llm.ts`
- Create: `packages/tutor/src/anthropic-llm.ts`
- Create: `packages/tutor/src/testing/scripted-llm.ts`
- Test: `packages/tutor/src/testing/scripted-llm.test.ts`, `packages/tutor/src/anthropic-llm.test.ts`

**Interfaces:**
- Consumes: `ToolBlock`, `ToolBlockAssembler`, `ToolDef`, `SystemBlock`.
- Produces: `LlmEvent`, `LlmMessage`, `LlmContentBlock`, `LlmRequest`, `LlmClient { stream(req); prewarm?(req) }`, `LlmError { status?; retryable }`, `toLlmError(err)`, `AnthropicLlm`, `ScriptedLlm`, helpers `toolEvent(name, input, id?)`, `stopEvent(reason?)`, `firstTokenEvent()`.

- [ ] **Step 1: Write the failing tests**

Create `packages/tutor/src/testing/scripted-llm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LlmError, type LlmRequest } from "../llm";
import { ScriptedLlm, stopEvent, toolEvent } from "./scripted-llm";

const request = (signal?: AbortSignal): LlmRequest => ({ model: "m", system: [], tools: [], messages: [{ role: "user", content: "x" }], max_tokens: 10, signal });

async function collect(llm: ScriptedLlm, signal?: AbortSignal) {
  const out = [];
  for await (const ev of llm.stream(request(signal))) out.push(ev);
  return out;
}

describe("ScriptedLlm", () => {
  it("plays one scripted round per call, repeats the last round, and records the requests", async () => {
    const llm = new ScriptedLlm([[toolEvent("speak", { text: "um" }), stopEvent()], [toolEvent("speak", { text: "dois" }), stopEvent()]]);
    const first = await collect(llm);
    const second = await collect(llm);
    const third = await collect(llm);
    expect(first[0]).toMatchObject({ type: "tool_block", block: { name: "speak" } });
    expect(JSON.parse((second[0] as { block: { raw_input: string } }).block.raw_input)).toEqual({ text: "dois" });
    expect(JSON.parse((third[0] as { block: { raw_input: string } }).block.raw_input)).toEqual({ text: "dois" });
    expect(llm.calls).toHaveLength(3);
  });

  it("can fail the first call, and stops when the signal aborts", async () => {
    const failing = new ScriptedLlm([[stopEvent()]], { failFirst: new LlmError("overloaded", 529, true) });
    await expect(collect(failing)).rejects.toMatchObject({ retryable: true });
    expect(await collect(failing)).toEqual([{ type: "stop", stop_reason: "end_turn" }]);

    const controller = new AbortController();
    controller.abort();
    expect(await collect(new ScriptedLlm([[toolEvent("speak", { text: "x" })]]), controller.signal)).toEqual([]);
  });
});
```

Create `packages/tutor/src/anthropic-llm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toLlmError } from "./anthropic-llm";

describe("toLlmError", () => {
  it("marks rate limits, overload and server errors as retryable and client errors as not", () => {
    expect(toLlmError(Object.assign(new Error("rate"), { status: 429 })).retryable).toBe(true);
    expect(toLlmError(Object.assign(new Error("overloaded"), { status: 529 })).retryable).toBe(true);
    expect(toLlmError(Object.assign(new Error("boom"), { status: 500 })).retryable).toBe(true);
    expect(toLlmError(Object.assign(new Error("bad"), { status: 400 })).retryable).toBe(false);
    expect(toLlmError(new Error("network")).retryable).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mento/tutor test`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Create `packages/tutor/src/llm.ts`:

```ts
import type { SystemBlock } from "./prompt-builder";
import type { ToolBlock } from "./tool-assembler";
import type { ToolDef } from "./tools";

export interface LlmUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export type LlmEvent =
  | { type: "first_token" }
  | { type: "tool_block"; block: ToolBlock }
  | { type: "stop"; stop_reason: string; usage?: LlmUsage };

export type LlmContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface LlmMessage {
  role: "user" | "assistant";
  content: string | LlmContentBlock[];
}

export interface LlmRequest {
  model: string;
  system: SystemBlock[];
  tools: ToolDef[];
  messages: LlmMessage[];
  max_tokens: number;
  signal?: AbortSignal;
}

export interface LlmClient {
  stream(req: LlmRequest): AsyncGenerator<LlmEvent>;
  /** Write the static prefix into the provider's prompt cache (no output). */
  prewarm?(req: Omit<LlmRequest, "signal" | "max_tokens">): Promise<void>;
}

export class LlmError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
    this.name = "LlmError";
  }
}
```

Create `packages/tutor/src/anthropic-llm.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { LlmError, type LlmClient, type LlmEvent, type LlmRequest } from "./llm";
import { ToolBlockAssembler, type RawStreamEvent } from "./tool-assembler";

export function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  const status = (err as { status?: number } | null)?.status;
  const message = err instanceof Error ? err.message : String(err);
  const retryable = status !== undefined && (status === 429 || status === 529 || status >= 500);
  return new LlmError(message, status, retryable);
}

export interface AnthropicLlmOptions {
  apiKey: string;
  baseURL?: string;
}

/** Streams a turn from the Anthropic Messages API and turns it into `LlmEvent`s (no SDK types leak out). */
export class AnthropicLlm implements LlmClient {
  private readonly client: Anthropic;

  constructor(opts: AnthropicLlmOptions) {
    // maxRetries 0: the turn engine owns the retry policy (one retry, only before any action was emitted).
    this.client = new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL, maxRetries: 0 });
  }

  private params(req: Omit<LlmRequest, "signal">) {
    return {
      model: req.model,
      max_tokens: req.max_tokens,
      system: req.system,
      tools: req.tools,
      messages: req.messages,
    };
  }

  async *stream(req: LlmRequest): AsyncGenerator<LlmEvent> {
    const assembler = new ToolBlockAssembler();
    let first = false;
    let stop_reason = "end_turn";
    const usage: NonNullable<Extract<LlmEvent, { type: "stop" }>["usage"]> = {};
    try {
      const stream = this.client.messages.stream(this.params(req) as unknown as Anthropic.MessageStreamParams, { signal: req.signal });
      for await (const event of stream) {
        const ev = event as unknown as RawStreamEvent & {
          message?: { usage?: Record<string, number> };
          usage?: Record<string, number>;
          delta?: { stop_reason?: string };
        };
        if (!first && (ev.type === "content_block_start" || ev.type === "content_block_delta")) {
          first = true;
          yield { type: "first_token" };
        }
        if (ev.type === "message_start" && ev.message?.usage) Object.assign(usage, ev.message.usage);
        if (ev.type === "message_delta") {
          if (ev.delta?.stop_reason) stop_reason = ev.delta.stop_reason;
          if (ev.usage) Object.assign(usage, ev.usage);
        }
        for (const block of assembler.push(ev)) yield { type: "tool_block", block };
      }
    } catch (err) {
      if (req.signal?.aborted) return;
      throw toLlmError(err);
    }
    yield { type: "stop", stop_reason, usage };
  }

  async prewarm(req: Omit<LlmRequest, "signal" | "max_tokens">): Promise<void> {
    try {
      await this.client.messages.create(this.params({ ...req, max_tokens: 0 }) as unknown as Anthropic.MessageCreateParamsNonStreaming);
    } catch (err) {
      throw toLlmError(err);
    }
  }
}
```

Create `packages/tutor/src/testing/scripted-llm.ts`:

```ts
import { LlmError, type LlmClient, type LlmEvent, type LlmRequest } from "../llm";

let nextId = 0;

/** A completed tool call, as the real client would yield it. */
export const toolEvent = (name: string, input: unknown, id = `toolu_${++nextId}`): LlmEvent => ({
  type: "tool_block",
  block: { id, name, raw_input: typeof input === "string" ? input : JSON.stringify(input) },
});
export const stopEvent = (stop_reason = "end_turn"): LlmEvent => ({ type: "stop", stop_reason });
export const firstTokenEvent = (): LlmEvent => ({ type: "first_token" });

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/**
 * Fake LLM for tests: each `stream()` call plays the next scripted round (the last round repeats),
 * waits `delayMs` before the first event, and can fail the very first call.
 */
export class ScriptedLlm implements LlmClient {
  readonly calls: LlmRequest[] = [];
  prewarmed = 0;
  private next = 0;

  constructor(
    private readonly rounds: LlmEvent[][],
    private readonly opts: { delayMs?: number; failFirst?: LlmError } = {},
  ) {}

  async *stream(req: LlmRequest): AsyncGenerator<LlmEvent> {
    this.calls.push(req);
    if (this.opts.failFirst && this.calls.length === 1) throw this.opts.failFirst;
    const round = this.rounds[Math.min(this.next++, this.rounds.length - 1)] ?? [];
    if (this.opts.delayMs) await sleep(this.opts.delayMs, req.signal);
    for (const ev of round) {
      if (req.signal?.aborted) return;
      yield ev;
    }
  }

  async prewarm(): Promise<void> {
    this.prewarmed += 1;
  }
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/tutor test && pnpm --filter @mento/tutor typecheck`
Expected: PASS. If `Anthropic.MessageStreamParams` or `Anthropic.MessageCreateParamsNonStreaming` is not found by the installed SDK version, replace those two casts with `as never`; the rest of the file does not depend on SDK types.

- [ ] **Step 5: Commit**

```bash
git add packages/tutor
git commit -m "feat(whiteboard): LLM interface, scripted fake and Anthropic streaming client"
```

---

### Task 6: Repository interface, hooks, retrieval step and action pipeline

**Files:**
- Create: `packages/tutor/src/repository.ts`
- Create: `packages/tutor/src/hooks.ts`
- Create: `packages/tutor/src/retrieval-step.ts`
- Create: `packages/tutor/src/turn-runtime.ts`
- Create: `packages/tutor/src/action-pipeline.ts`
- Create: `packages/tutor/src/testing/memory-repository.ts`, `packages/tutor/src/testing/index.ts`
- Test: `packages/tutor/src/retrieval-step.test.ts`, `packages/tutor/src/turn-runtime.test.ts`, `packages/tutor/src/action-pipeline.test.ts`

**Interfaces:**
- Consumes: `Board`, `sanitizeHtml`, `ToolBlock`, contracts.
- Produces:
  - `TurnRepository` (`createSession`, `getSession`, `appendEvent`, `listEvents`, `endSession`, `getClassContext`, `getLearnerSummary`, `getCatalog`), `SessionInfo`.
  - `TtsStarter`, `DrawPipeline`, `Judge`, `JudgeInput`, `noopDraw`, `noopJudge`, `emptyRetriever`.
  - `retrievalQuery(appended, lastTopic)`, `filterSources(sources, passages, retriever)`.
  - `Runtime`, `restoreRuntime(events)`, `OrderedQueue`.
  - `prepareAction(block, ctx)`, `commitAction(action, order, ctx)`.
  - `InMemoryTurnRepository`, `testing/index.ts` exports (`ScriptedLlm`, helpers, `InMemoryTurnRepository`).

- [ ] **Step 1: Write the failing tests**

Create `packages/tutor/src/retrieval-step.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Chunk, Retriever } from "@mento/contracts";
import { filterSources, retrievalQuery } from "./retrieval-step";

describe("retrievalQuery", () => {
  it("combines the selection, the message and the last topic", () => {
    expect(
      retrievalQuery([{ name: "user_message", kind: "board_select", text: "O que é isso?", selected: { element_id: "tl", text: "27 a.C." } }], "Da República ao Império"),
    ).toBe("27 a.C. O que é isso? Da República ao Império");
  });

  it("uses the answer text, and skips the opening turn and short acknowledgements", () => {
    expect(retrievalQuery([{ name: "verification_answer", verification_id: "v", element_id: "q", answer: "Mudou o governo" }], "")).toBe("Mudou o governo");
    expect(retrievalQuery([], "tema")).toBeNull();
    expect(retrievalQuery([{ name: "user_message", kind: "chat", text: "ok" }], "tema")).toBeNull();
    expect(retrievalQuery([{ name: "user_message", kind: "chat", text: "Entendi!" }], "tema")).toBeNull();
  });
});

describe("filterSources", () => {
  const passage: Chunk = { id: "c1", material_id: "m1", subject: "history", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto." };
  const retriever = (valid: boolean): Retriever => ({ searchChunks: async () => [], validateCitation: async () => valid });

  it("keeps a quote found in a retrieved passage without asking the database", async () => {
    let asked = 0;
    const r: Retriever = { searchChunks: async () => [], validateCitation: async () => (asked++, false) };
    const out = await filterSources([{ material_id: "m1", page: 12, quote: "o  Senado concedeu a OTÁVIO o título" }], [passage], r);
    expect(out.kept).toHaveLength(1);
    expect(out.dropped).toBe(0);
    expect(asked).toBe(0);
  });

  it("falls back to the retriever for quotes outside the retrieved passages, and drops fakes", async () => {
    const fake = { material_id: "m1", page: 99, quote: "texto inventado" };
    expect((await filterSources([fake], [passage], retriever(true))).kept).toHaveLength(1);
    const dropped = await filterSources([fake], [passage], retriever(false));
    expect(dropped.kept).toHaveLength(0);
    expect(dropped.dropped).toBe(1);
  });
});
```

Create `packages/tutor/src/turn-runtime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Event } from "@mento/contracts";
import { OrderedQueue, restoreRuntime } from "./turn-runtime";

const ev = (type: Event["type"], payload: unknown, n = 1): Event => ({ id: String(n), session_id: "s", ts: "2026-10-30T21:00:00.000Z", type, payload });
const action = (turn: number, name: string, args: unknown, id: string) => ev("tutor_action", { turn_id: `turn_${turn}`, action_id: id, order: 0, name, args });

describe("restoreRuntime", () => {
  it("rebuilds the board, turn counter, verification counter, last topic and open verification from events", () => {
    const rt = restoreRuntime([
      action(1, "write_text", { id: "title", column: "main", html: "<h1>Da República ao Império</h1>" }, "act_1_0"),
      action(2, "ask_verification", { id: "q1", column: "main", verification_id: "ver_1", concept: "Fim da República", concept_key: "fim da republica", question: "Por que mudou?", kind: "explain" }, "act_2_0"),
      ev("verification_asked", { verification_id: "ver_1", concept_key: "fim da republica" }),
    ]);
    expect(rt.turnNo).toBe(2);
    expect(rt.verSeq).toBe(1);
    expect(rt.board.has("title")).toBe(true);
    expect(rt.board.has("q1")).toBe(true);
    expect(rt.lastTopic).toBe("Da República ao Império");
    expect(rt.openVerification).toEqual({ verification_id: "ver_1", concept_key: "fim da republica" });
  });

  it("clears the open verification once it was answered and ignores invalid stored actions", () => {
    const rt = restoreRuntime([
      ev("verification_asked", { verification_id: "ver_1", concept_key: "x" }),
      ev("verification_answered", { verification_id: "ver_1", element_id: "q", answer: "a" }),
      action(1, "highlight", { target_id: "ghost", color: "yellow" }, "act_1_0"),
    ]);
    expect(rt.openVerification).toBeUndefined();
    expect(rt.turnNo).toBe(1);
  });
});

describe("OrderedQueue", () => {
  it("runs tasks one after another in order and reports failures without stopping", async () => {
    const seen: string[] = [];
    const errors: unknown[] = [];
    const q = new OrderedQueue((e) => errors.push(e));
    q.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 20));
      seen.push("a");
    });
    q.enqueue(async () => {
      throw new Error("boom");
    });
    q.enqueue(async () => {
      seen.push("c");
    });
    await q.flush();
    expect(seen).toEqual(["a", "c"]);
    expect(errors).toHaveLength(1);
  });
});
```

Create `packages/tutor/src/action-pipeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Chunk, Retriever, StreamMessage } from "@mento/contracts";
import { Board } from "./board";
import { commitAction, prepareAction, type PrepareContext } from "./action-pipeline";
import type { ToolBlock } from "./tool-assembler";

const block = (name: string, input: unknown): ToolBlock => ({ id: "toolu_1", name, raw_input: typeof input === "string" ? input : JSON.stringify(input) });
const retriever: Retriever = { searchChunks: async () => [], validateCitation: async () => false };
const passage: Chunk = { id: "c1", material_id: "m1", subject: "history", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto." };
const ctx = (board = new Board(), passages: Chunk[] = []): PrepareContext => ({ id: "act_1_0", verification_id: "ver_1", board, passages, retriever });

describe("prepareAction", () => {
  it("accepts a valid speak", async () => {
    const out = await prepareAction(block("speak", { text: "Olá!" }), ctx());
    expect(out).toMatchObject({ kind: "ok", action: { id: "act_1_0", name: "speak" } });
  });

  it("drops invalid JSON, unknown tools, schema violations and board violations with a reason", async () => {
    for (const b of [
      block("speak", '{"text": "cortado'),
      block("teleport", {}),
      block("speak", { text: "x", purpose: "hint" }),
      block("highlight", { target_id: "ghost", color: "yellow" }),
      block("draw_result", { element_id: "x", url: "/x" }),
    ]) {
      const out = await prepareAction(b, ctx());
      expect(out.kind, b.name).toBe("dropped");
    }
  });

  it("fills verification_id and concept_key for ask_verification", async () => {
    const out = await prepareAction(
      block("ask_verification", { id: "q1", column: "main", concept: "Fim da República", question: "Por que mudou?", kind: "explain" }),
      ctx(),
    );
    expect(out).toMatchObject({ kind: "ok", action: { args: { verification_id: "ver_1", concept_key: "fim da republica" } } });
  });

  it("sanitizes HTML and drops a write_text that becomes empty", async () => {
    const ok = await prepareAction(block("write_text", { id: "t", column: "main", html: '<h1 onclick="x">Roma</h1><script>1</script>' }), ctx());
    expect(ok).toMatchObject({ kind: "ok", action: { args: { html: "<h1>Roma</h1>" } } });
    const empty = await prepareAction(block("write_text", { id: "t2", column: "main", html: "<script>1</script>" }), ctx());
    expect(empty.kind).toBe("dropped");
  });

  it("removes fake citations but keeps the action", async () => {
    const real = { material_id: "m1", page: 12, quote: "o Senado concedeu a Otávio" };
    const fake = { material_id: "m1", page: 40, quote: "frase inventada" };
    const out = await prepareAction(block("speak", { text: "Repare.", sources: [real, fake] }), ctx(new Board(), [passage]));
    expect(out).toMatchObject({ kind: "ok", dropped_citations: 1 });
    if (out.kind === "ok" && out.action.name === "speak") expect(out.action.args.sources).toEqual([real]);
  });
});

describe("commitAction", () => {
  function setup() {
    const emitted: StreamMessage[] = [];
    const persisted: { type: string; payload: unknown }[] = [];
    const board = new Board();
    return {
      emitted, persisted, board,
      ctx: { turn_id: "turn_3", board, openVerification: { verification_id: "ver_1", concept_key: "fim da republica" }, persist: (e: { type: string; payload: unknown }) => persisted.push(e), emit: (m: StreamMessage) => emitted.push(m) },
    };
  }

  it("applies, emits and persists a tutor_action", () => {
    const s = setup();
    commitAction({ id: "act_3_0", name: "write_text", args: { id: "title", column: "main", html: "<h1>x</h1>" } }, 0, s.ctx as never);
    expect(s.board.has("title")).toBe(true);
    expect(s.emitted).toEqual([{ type: "action", order: 0, action: { id: "act_3_0", name: "write_text", args: { id: "title", column: "main", html: "<h1>x</h1>" } } }]);
    expect(s.persisted).toEqual([{ type: "tutor_action", payload: { turn_id: "turn_3", action_id: "act_3_0", order: 0, name: "write_text", args: { id: "title", column: "main", html: "<h1>x</h1>" } } }]);
  });

  it("also persists hint_given for hints and verification_asked for questions", () => {
    const s = setup();
    commitAction({ id: "a1", name: "speak", args: { text: "Pense na data.", purpose: "hint", hint_level: 2 } }, 0, s.ctx as never);
    expect(s.persisted.map((e) => e.type)).toEqual(["tutor_action", "hint_given"]);
    expect(s.persisted[1]?.payload).toEqual({ turn_id: "turn_3", level: 2, verification_id: "ver_1", concept_key: "fim da republica" });

    commitAction({ id: "a2", name: "ask_verification", args: { id: "q1", column: "main", verification_id: "ver_2", concept: "Fim da República", concept_key: "fim da republica", question: "Por quê?", kind: "explain" } }, 1, s.ctx as never);
    expect(s.persisted.at(-1)).toEqual({ type: "verification_asked", payload: { verification_id: "ver_2", element_id: "q1", concept: "Fim da República", concept_key: "fim da republica", question: "Por quê?", kind: "explain" } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mento/tutor test`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Create `packages/tutor/src/repository.ts`:

```ts
import type { Event, EventType } from "@mento/contracts";
import type { CatalogEntry, ClassContext, LearnerSummary } from "./prompt-builder";

export interface SessionInfo {
  id: string;
  student_id: string;
  modality: "text" | "voice";
}

/**
 * The slice of the Repository (contracts-spec §9) that the tutor needs. Person 1's MongoDB repository
 * implements it; `InMemoryTurnRepository` (testing) is used until then and in tests.
 */
export interface TurnRepository {
  createSession(input: { student_id: string; modality: "text" | "voice"; topic?: string }): Promise<{ id: string }>;
  getSession(session_id: string): Promise<SessionInfo | null>;
  appendEvent(session_id: string, event: { type: EventType; payload: unknown }): Promise<Event>;
  listEvents(session_id: string): Promise<Event[]>;
  /** Appends `session_ended` (which triggers the analysis). */
  endSession(session_id: string, reason: string): Promise<void>;
  getClassContext(): Promise<ClassContext>;
  getLearnerSummary(student_id: string): Promise<LearnerSummary>;
  getCatalog(): Promise<CatalogEntry[]>;
}
```

Create `packages/tutor/src/hooks.ts`:

```ts
import type { Action, Chunk, Retriever, StreamMessage, WordTiming } from "@mento/contracts";

/** Structural subset of `TtsService` (Plan 2). */
export interface TtsStarter {
  start(req: { action_id: string; text: string }): Promise<{ words: WordTiming[]; first_byte_ms: number | null; audio_bytes: number; cached: boolean }>;
  cancel?(action_id: string): void;
}

/** Starts an image/diagram job for a `draw` action; resolves with the late messages to send (Plan 4). */
export interface DrawPipeline {
  start(action: Extract<Action, { name: "draw" }>, ctx: { session_id: string; signal: AbortSignal }): Promise<StreamMessage[]>;
}
export const noopDraw: DrawPipeline = { start: async () => [] };

export interface JudgeInput {
  session_id: string;
  student_id: string;
  verification_id: string;
  element_id: string;
  answer: string;
}
/** Records evidence for a student's answer (Plan 4). Runs in the background. */
export interface Judge {
  start(input: JudgeInput): Promise<void>;
}
export const noopJudge: Judge = { start: async () => undefined };

/** Used until the real retriever exists (Plan 5): finds nothing and trusts no citation. */
export const emptyRetriever: Retriever = {
  searchChunks: async (): Promise<Chunk[]> => [],
  validateCitation: async () => false,
};
```

Create `packages/tutor/src/retrieval-step.ts`:

```ts
import type { Citation, Chunk, Retriever, TurnRequest } from "@mento/contracts";

const ACKNOWLEDGEMENT = /^(ok|okay|sim|não|nao|certo|entendi|entendido|tá|ta|beleza|aham|uhum)[.!? ]*$/i;

/** Text to search the materials with before the LLM call, or null when no search is worth doing. */
export function retrievalQuery(appended: TurnRequest["appended"], lastTopic: string): string | null {
  let text: string | undefined;
  let selected: string | undefined;
  for (const a of appended) {
    if (a.name === "user_message") {
      text = a.text;
      selected = a.selected?.text;
    } else if (!text) {
      text = a.answer;
    }
  }
  if (!text || ACKNOWLEDGEMENT.test(text.trim())) return null;
  return [selected, text, lastTopic].filter(Boolean).join(" ").slice(0, 500);
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");

/** Keep citations whose quote occurs in a passage given this turn, or that the retriever confirms. */
export async function filterSources(
  sources: Citation[],
  passages: Chunk[],
  retriever: Retriever,
): Promise<{ kept: Citation[]; dropped: number }> {
  const kept: Citation[] = [];
  for (const c of sources) {
    const quote = norm(c.quote);
    const inPassages = passages.some((p) => p.material_id === c.material_id && p.page === c.page && norm(p.text).includes(quote));
    if (inPassages || (await retriever.validateCitation(c))) kept.push(c);
  }
  return { kept, dropped: sources.length - kept.length };
}
```

Create `packages/tutor/src/turn-runtime.ts`:

```ts
import { Action, type Event } from "@mento/contracts";
import { Board } from "./board";

/** What the server remembers about one session between turns (rebuilt from events after a restart). */
export interface Runtime {
  board: Board;
  turnNo: number;
  verSeq: number;
  lastTopic: string;
  openVerification?: { verification_id: string; concept_key: string };
}

export function restoreRuntime(events: Event[]): Runtime {
  const rt: Runtime = { board: new Board(), turnNo: 0, verSeq: 0, lastTopic: "" };
  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (e.type === "tutor_action") {
      const m = /^turn_(\d+)$/.exec(String(p.turn_id ?? ""));
      if (m) rt.turnNo = Math.max(rt.turnNo, Number(m[1]));
      const parsed = Action.safeParse({ id: p.action_id, name: p.name, args: p.args });
      if (parsed.success && rt.board.validate(parsed.data).ok) {
        rt.board.apply(parsed.data);
        if (parsed.data.name === "write_text") rt.lastTopic = (rt.board.get(parsed.data.args.id)?.text ?? "").slice(0, 80);
      }
    } else if (e.type === "verification_asked") {
      rt.verSeq += 1;
      rt.openVerification = { verification_id: String(p.verification_id), concept_key: String(p.concept_key) };
    } else if (e.type === "verification_answered" && rt.openVerification?.verification_id === p.verification_id) {
      rt.openVerification = undefined;
    }
  }
  return rt;
}

/** Runs async tasks strictly in order (event persistence keeps the order of the conversation). */
export class OrderedQueue {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly onError: (err: unknown) => void) {}

  enqueue(task: () => Promise<unknown>): void {
    this.tail = this.tail.then(task).then(() => undefined, this.onError);
  }

  flush(): Promise<void> {
    return this.tail;
  }
}
```

Create `packages/tutor/src/action-pipeline.ts`:

```ts
import { Action, normalizeConcept, type Chunk, type EventType, type Retriever, type StreamMessage } from "@mento/contracts";
import type { Board } from "./board";
import { sanitizeHtml } from "./sanitize";
import { filterSources } from "./retrieval-step";
import type { ToolBlock } from "./tool-assembler";

export interface PrepareContext {
  /** Server-assigned action id, e.g. `act_3_0`. */
  id: string;
  /** Server-assigned id used if this block is an `ask_verification`. */
  verification_id: string;
  board: Board;
  /** Passages given to the model this turn (first place to check quotes). */
  passages: Chunk[];
  retriever: Retriever;
}

export type Prepared =
  | { kind: "ok"; action: Action; dropped_citations: number }
  | { kind: "dropped"; reason: string };

const dropped = (reason: string): Prepared => ({ kind: "dropped", reason });

/** Parse a tool block into a trusted action, or say why it must be dropped. Never throws. */
export async function prepareAction(block: ToolBlock, ctx: PrepareContext): Promise<Prepared> {
  let input: unknown;
  try {
    input = JSON.parse(block.raw_input);
  } catch {
    return dropped(`${block.name}: invalid or truncated JSON`);
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) return dropped(`${block.name}: input is not an object`);

  let args = input as Record<string, unknown>;
  if (block.name === "ask_verification") {
    args = { ...args, verification_id: ctx.verification_id, concept_key: normalizeConcept(String(args.concept ?? "")) };
  }

  const parsed = Action.safeParse({ id: ctx.id, name: block.name, args });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return dropped(`invalid ${block.name}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? ""}`.trim());
  }
  let action: Action = parsed.data;

  const verdict = ctx.board.validate(action);
  if (!verdict.ok) return dropped(verdict.reason);

  if (action.name === "write_text" || action.name === "update_element") {
    const html = sanitizeHtml(action.args.html);
    if (!html.trim()) return dropped(`${action.name}: empty html after sanitizing`);
    action = { ...action, args: { ...action.args, html } } as Action;
  }

  let dropped_citations = 0;
  if ((action.name === "speak" || action.name === "write_text") && action.args.sources?.length) {
    const { kept, dropped: n } = await filterSources(action.args.sources, ctx.passages, ctx.retriever);
    dropped_citations = n;
    action = { ...action, args: { ...action.args, sources: kept.length ? kept : undefined } } as Action;
  }
  return { kind: "ok", action, dropped_citations };
}

export interface CommitContext {
  turn_id: string;
  board: Board;
  openVerification?: { verification_id: string; concept_key: string };
  persist: (event: { type: EventType; payload: unknown }) => void;
  emit: (message: StreamMessage) => void;
}

/** Apply a prepared action to the board, send it to the client and record the events. */
export function commitAction(action: Action, order: number, ctx: CommitContext): void {
  ctx.board.apply(action);
  ctx.emit({ type: "action", order, action });
  ctx.persist({
    type: "tutor_action",
    payload: { turn_id: ctx.turn_id, action_id: action.id, order, name: action.name, args: action.args },
  });
  if ((action.name === "speak" || action.name === "write_text") && action.args.purpose === "hint" && action.args.hint_level) {
    ctx.persist({
      type: "hint_given",
      payload: {
        turn_id: ctx.turn_id,
        level: action.args.hint_level,
        verification_id: ctx.openVerification?.verification_id,
        concept_key: ctx.openVerification?.concept_key,
      },
    });
  }
  if (action.name === "ask_verification") {
    ctx.persist({
      type: "verification_asked",
      payload: {
        verification_id: action.args.verification_id,
        element_id: action.args.id,
        concept: action.args.concept,
        concept_key: action.args.concept_key,
        question: action.args.question,
        kind: action.args.kind,
      },
    });
  }
}
```

Create `packages/tutor/src/testing/memory-repository.ts`:

```ts
import type { Event, EventType } from "@mento/contracts";
import type { CatalogEntry, ClassContext, LearnerSummary } from "../prompt-builder";
import type { SessionInfo, TurnRepository } from "../repository";

export interface MemorySeed {
  classContext?: ClassContext;
  summary?: LearnerSummary;
  catalog?: CatalogEntry[];
}

/** In-memory `TurnRepository` for tests and for running the API before the MongoDB repository exists. */
export class InMemoryTurnRepository implements TurnRepository {
  private readonly sessions = new Map<string, SessionInfo>();
  private readonly events = new Map<string, Event[]>();
  private seq = 0;

  constructor(private readonly seed: MemorySeed = {}) {}

  private nextId(): string {
    return (++this.seq).toString(16).padStart(24, "0");
  }

  async createSession(input: { student_id: string; modality: "text" | "voice"; topic?: string }): Promise<{ id: string }> {
    const id = this.nextId();
    this.sessions.set(id, { id, student_id: input.student_id, modality: input.modality });
    this.events.set(id, []);
    await this.appendEvent(id, { type: "session_started", payload: { student_id: input.student_id, modality: input.modality, topic: input.topic } });
    return { id };
  }

  async getSession(session_id: string): Promise<SessionInfo | null> {
    return this.sessions.get(session_id) ?? null;
  }

  async appendEvent(session_id: string, event: { type: EventType; payload: unknown }): Promise<Event> {
    const list = this.events.get(session_id);
    if (!list) throw new Error(`unknown session ${session_id}`);
    const stored: Event = { id: this.nextId(), session_id, ts: new Date().toISOString(), type: event.type, payload: event.payload };
    list.push(stored);
    return stored;
  }

  async listEvents(session_id: string): Promise<Event[]> {
    return [...(this.events.get(session_id) ?? [])];
  }

  async endSession(session_id: string, reason: string): Promise<void> {
    await this.appendEvent(session_id, { type: "session_ended", payload: { reason } });
  }

  async getClassContext(): Promise<ClassContext> {
    return this.seed.classContext ?? { grade_level: "8º ano", description: "" };
  }

  async getLearnerSummary(): Promise<LearnerSummary> {
    return this.seed.summary ?? { open_gaps: [], recent_progress: [] };
  }

  async getCatalog(): Promise<CatalogEntry[]> {
    return this.seed.catalog ?? [];
  }
}
```

Create `packages/tutor/src/testing/index.ts`:

```ts
export * from "./scripted-llm";
export * from "./memory-repository";
```

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/tutor test && pnpm --filter @mento/tutor typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tutor
git commit -m "feat(whiteboard): repository interface, hooks, retrieval step and action pipeline"
```

---

### Task 7: The `TurnEngine`

**Files:**
- Create: `packages/tutor/src/turn-engine.ts`
- Modify: `packages/tutor/src/index.ts` (export the public surface)
- Test: `packages/tutor/src/turn-engine.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: `TurnEngine { prewarm(session_id); run(session_id, req, emit, signal): Promise<{ turn_id: string }>; forget(session_id); idle() }`, `TurnEngineDeps`, `SessionNotFoundError`.

Behavior implemented (each is covered by a test below): opening turn; ordered emission with server action ids; dropping invalid blocks; hint, verification and interruption events; voice mode starts the TTS job and sends `speech_alignment`; `draw` starts the pipeline and its late messages arrive before `turn_done`; one `search_materials` round with `tool_result`; one retry on retryable errors; bridging `speak`; abort stops everything and cancels TTS; runtime restored from events after a restart; judge started in the background after an answer.

- [ ] **Step 1: Write the failing tests**

Create `packages/tutor/src/turn-engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { StreamMessage, type Chunk, type Retriever, type TurnRequest } from "@mento/contracts";
import { LlmError } from "./llm";
import { InMemoryTurnRepository, ScriptedLlm, stopEvent, toolEvent } from "./testing";
import { TurnEngine, SessionNotFoundError, type TurnEngineDeps } from "./turn-engine";
import { noopDraw, noopJudge, type DrawPipeline, type Judge, type TtsStarter } from "./hooks";

const prompts = { base: "BASE", subjects: { history: "HISTORY", generic: "GENERIC" } };
const passage: Chunk = { id: "c1", material_id: "m1", subject: "history", chapter: "O Império", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto." };
const retriever = (chunks: Chunk[] = []): Retriever => ({ searchChunks: async () => chunks, validateCitation: async () => false });

async function setup(rounds: Parameters<typeof ScriptedLlm.prototype.stream>[0] extends never ? never : ConstructorParameters<typeof ScriptedLlm>[0], overrides: Partial<TurnEngineDeps> = {}, llmOpts: ConstructorParameters<typeof ScriptedLlm>[1] = {}) {
  const repo = new InMemoryTurnRepository({ catalog: [{ material_id: "m1", title: "História de Roma", subject: "history", chapters: ["O Império"] }] });
  const llm = new ScriptedLlm(rounds, llmOpts);
  const engine = new TurnEngine({ llm, repo, retriever: retriever(), tts: null, draw: noopDraw, judge: noopJudge, prompts, models: { tutor: "tutor-model" }, bridgeAfterMs: 5_000, ...overrides });
  const { id } = await repo.createSession({ student_id: "stu_1", modality: "text" });
  return { repo, llm, engine, session: id };
}

const opening: TurnRequest = { modality: "text", appended: [] };
const say = (text: string): TurnRequest => ({ modality: "text", appended: [{ name: "user_message", kind: "chat", text }] });

async function run(engine: TurnEngine, session: string, req: TurnRequest, signal = new AbortController().signal) {
  const messages: StreamMessage[] = [];
  const result = await engine.run(session, req, (m) => messages.push(m), signal);
  await engine.idle();
  return { messages, result };
}
const types = (ms: StreamMessage[]) => ms.map((m) => m.type);
const actionNames = (ms: StreamMessage[]) => ms.flatMap((m) => (m.type === "action" ? [m.action.name] : []));

describe("TurnEngine: the script", () => {
  it("streams an opening turn: ordered actions with server ids, then script_done and turn_done with timing", async () => {
    const { engine, session, repo, llm } = await setup([[toolEvent("speak", { text: "Olá! O que vamos estudar?" }), toolEvent("write_text", { id: "title", column: "main", html: "<h1>Vamos começar</h1>" }), stopEvent()]]);
    const { messages, result } = await run(engine, session, opening);
    expect(result.turn_id).toBe("turn_1");
    expect(types(messages)).toEqual(["action", "action", "script_done", "turn_done"]);
    expect(messages.map((m) => (m.type === "action" ? [m.order, m.action.id] : null))).toEqual([[0, "act_1_0"], [1, "act_1_1"], null, null]);
    for (const m of messages) StreamMessage.parse(m);
    const done = messages.at(-1);
    expect(done).toMatchObject({ type: "turn_done", turn_id: "turn_1" });
    expect(done?.type === "turn_done" && done.timing?.first_action_ms).toBeGreaterThanOrEqual(0);

    const events = await repo.listEvents(session);
    expect(events.map((e) => e.type)).toEqual(["session_started", "tutor_action", "tutor_action", "turn_timing"]);
    expect(JSON.stringify(llm.calls[0]?.messages)).toContain("The conversation is starting");
    expect(llm.calls[0]?.model).toBe("tutor-model");
    expect(llm.calls[0]?.system[1]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("drops invalid blocks and forwards only valid actions", async () => {
    const { engine, session } = await setup([[
      toolEvent("highlight", { target_id: "ghost", color: "yellow" }),
      toolEvent("teleport", {}),
      toolEvent("speak", '{"text": "cortado'),
      toolEvent("speak", { text: "Isto passa." }),
      stopEvent(),
    ]]);
    const { messages } = await run(engine, session, opening);
    expect(actionNames(messages)).toEqual(["speak"]);
    expect(messages.some((m) => m.type === "error")).toBe(false);
  });

  it("records student input, hints, verifications, interruptions and starts the judge on an answer", async () => {
    const judged: unknown[] = [];
    const judge: Judge = { start: async (i) => void judged.push(i) };
    const { engine, session, repo } = await setup(
      [
        [toolEvent("ask_verification", { id: "q1", column: "main", concept: "Fim da República", question: "Por que mudou?", kind: "explain" }), stopEvent()],
        [toolEvent("speak", { text: "Pense no Senado.", purpose: "hint", hint_level: 1 }), stopEvent()],
      ],
      { judge },
    );
    const first = await run(engine, session, say("Quero estudar Roma"));
    expect(actionNames(first.messages)).toEqual(["ask_verification"]);
    const ask = first.messages[0];
    expect(ask?.type === "action" && ask.action.name === "ask_verification" && ask.action.args.verification_id).toBe("ver_1");

    await run(engine, session, {
      modality: "text",
      appended: [{ name: "verification_answer", verification_id: "ver_1", element_id: "q1", answer: "Não sei" }],
      interrupted: { turn_id: "turn_1", action_id: "act_1_0", spoken_chars: 20 },
    });
    const events = await repo.listEvents(session);
    const kinds = events.map((e) => e.type);
    for (const t of ["user_message", "verification_asked", "interrupted", "verification_answered", "hint_given"]) expect(kinds).toContain(t);
    expect(events.find((e) => e.type === "hint_given")?.payload).toMatchObject({ level: 1, verification_id: undefined });
    expect(judged).toEqual([{ session_id: session, student_id: "stu_1", verification_id: "ver_1", element_id: "q1", answer: "Não sei" }]);
  });

  it("restores the board from events after a restart", async () => {
    const { engine, session, repo, llm } = await setup([[toolEvent("write_text", { id: "title", column: "main", html: "<h1>Roma</h1>" }), stopEvent()]]);
    await run(engine, session, opening);
    const engine2 = new TurnEngine({ llm: new ScriptedLlm([[toolEvent("highlight", { target_id: "title", color: "yellow" }), stopEvent()]]), repo, retriever: retriever(), tts: null, draw: noopDraw, judge: noopJudge, prompts, models: { tutor: "m" } });
    const { messages, result } = await run(engine2, session, say("continue"));
    expect(actionNames(messages)).toEqual(["highlight"]);
    expect(result.turn_id).toBe("turn_2");
    expect(llm.calls).toHaveLength(1);
  });

  it("rejects an unknown session", async () => {
    const { engine } = await setup([[stopEvent()]]);
    await expect(engine.run("nope", opening, () => undefined, new AbortController().signal)).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

describe("TurnEngine: voice, drawing and search", () => {
  it("starts a TTS job for each speak in voice mode, sets the audio fields and sends the alignment before turn_done", async () => {
    const started: string[] = [];
    const tts: TtsStarter = {
      start: async ({ action_id, text }) => {
        started.push(`${action_id}:${text}`);
        return { words: [{ word: "Olá!", start_ms: 0, end_ms: 300 }], first_byte_ms: 120, audio_bytes: 100, cached: false };
      },
    };
    const { engine, session } = await setup([[toolEvent("speak", { text: "Olá!" }), stopEvent()]], { tts });
    const { messages } = await run(engine, session, { modality: "voice", appended: [] });
    expect(started).toEqual(["act_1_0:Olá!"]);
    const first = messages[0];
    expect(first?.type === "action" && first.action.name === "speak" && first.action.args.audio_url).toBe("/api/tts/act_1_0");
    // The alignment may arrive before or after script_done (it depends on how fast the TTS is), never after turn_done.
    expect(types(messages)[0]).toBe("action");
    expect(types(messages)).toContain("speech_alignment");
    expect(types(messages).indexOf("script_done")).toBeLessThan(types(messages).indexOf("turn_done"));
    expect(types(messages).at(-1)).toBe("turn_done");
    expect(messages.at(-1)).toMatchObject({ timing: { tts_first_byte_ms: 120 } });
  });

  it("starts the draw pipeline, delivers its late messages before turn_done and keeps the order increasing", async () => {
    const draw: DrawPipeline = { start: async (a) => [{ type: "action", order: 99, action: { id: "late", name: "draw_result", args: { element_id: a.args.id, url: "/api/gen/x.jpg" } } }] };
    const { engine, session } = await setup([[toolEvent("draw", { id: "colosseum", column: "visuals", prompt: "Coliseu", is_structured: false, max_dimensions: { w: 500, h: 400 } }), stopEvent()]], { draw });
    const { messages } = await run(engine, session, opening);
    expect(actionNames(messages)).toEqual(["draw", "draw_result"]);
    expect(types(messages).at(-1)).toBe("turn_done");
    expect(types(messages)).toContain("script_done");
    const orders = messages.flatMap((m) => (m.type === "action" ? [m.order] : []));
    expect(orders).toEqual([0, 1]); // the pipeline's own order (99) is replaced by the next number
  });

  it("answers a search_materials call with a second round, keeps real citations and drops fake ones", async () => {
    const { engine, session, llm } = await setup(
      [
        [toolEvent("speak", { text: "Vou conferir no livro." }, "toolu_a"), toolEvent("search_materials", { query: "Augusto" }, "toolu_b"), stopEvent("tool_use")],
        [
          toolEvent("speak", { text: "Achei!", sources: [{ material_id: "m1", page: 12, quote: "o Senado concedeu a Otávio o título de Augusto" }, { material_id: "m1", page: 99, quote: "inventada" }] }),
          stopEvent(),
        ],
      ],
      { retriever: retriever([passage]) },
    );
    const { messages } = await run(engine, session, say("Quem foi Augusto?"));
    expect(llm.calls).toHaveLength(2);
    const second = llm.calls[1]!.messages;
    expect(second).toHaveLength(3);
    expect(second[1]).toMatchObject({ role: "assistant" });
    const results = (second[2]!.content as { type: string; tool_use_id: string; content: string }[]);
    expect(results.map((r) => r.tool_use_id)).toEqual(["toolu_a", "toolu_b"]);
    expect(results[1]?.content).toContain("[m1 · p.12 · O Império]");
    const speaks = messages.flatMap((m) => (m.type === "action" && m.action.name === "speak" ? [m.action.args] : []));
    expect(speaks).toHaveLength(2);
    expect(speaks[1]?.sources).toEqual([{ material_id: "m1", page: 12, quote: "o Senado concedeu a Otávio o título de Augusto" }]);
    expect(types(messages).filter((t) => t === "script_done")).toHaveLength(1);
  });

  it("puts the passages found before the call into the prompt", async () => {
    const { engine, session, llm } = await setup([[stopEvent()]], { retriever: retriever([passage]) });
    await run(engine, session, say("Quem foi Augusto?"));
    expect(JSON.stringify(llm.calls[0]?.messages)).toContain("[m1 · p.12 · O Império]");
  });
});

describe("TurnEngine: failures", () => {
  it("retries once on a retryable error before any action, without telling the client", async () => {
    const { engine, session, llm } = await setup([[toolEvent("speak", { text: "Voltei." }), stopEvent()]], {}, { failFirst: new LlmError("overloaded", 529, true) });
    const { messages } = await run(engine, session, opening);
    expect(llm.calls).toHaveLength(2);
    expect(types(messages)).toEqual(["action", "script_done", "turn_done"]);
  });

  it("sends a recoverable error and no turn_done when the LLM fails for good", async () => {
    const { engine, session } = await setup([[stopEvent()]], {}, { failFirst: new LlmError("bad request", 400, false) });
    const { messages } = await run(engine, session, opening);
    expect(messages).toEqual([{ type: "error", code: "llm_error", message: "O tutor teve um problema. Tente de novo.", recoverable: true }]);
  });

  it("speaks a bridging line when the model is slow, then continues", async () => {
    const { engine, session } = await setup([[toolEvent("speak", { text: "Pronto." }), stopEvent()]], { bridgeAfterMs: 20 }, { delayMs: 120 });
    const { messages } = await run(engine, session, opening);
    const texts = messages.flatMap((m) => (m.type === "action" && m.action.name === "speak" ? [m.action.args.text] : []));
    expect(texts).toEqual(["Deixa eu pensar um instante…", "Pronto."]);
  });

  it("stops without script_done or turn_done when the client aborts, and cancels TTS jobs", async () => {
    const cancelled: string[] = [];
    const tts: TtsStarter = { start: async () => ({ words: [], first_byte_ms: 1, audio_bytes: 1, cached: false }), cancel: (id) => void cancelled.push(id) };
    const { engine, session } = await setup([[toolEvent("speak", { text: "Um." }), toolEvent("speak", { text: "Dois." }), toolEvent("speak", { text: "Três." }), stopEvent()]], { tts });
    const controller = new AbortController();
    const messages: StreamMessage[] = [];
    await engine.run(session, { modality: "voice", appended: [] }, (m) => { messages.push(m); controller.abort(); }, controller.signal);
    await engine.idle();
    expect(actionNames(messages)).toEqual(["speak"]);
    expect(types(messages)).not.toContain("script_done");
    expect(types(messages)).not.toContain("turn_done");
    expect(cancelled).toEqual(["act_1_0"]);
  });
});

describe("TurnEngine.prewarm", () => {
  it("asks the LLM to cache the static prefix", async () => {
    const { engine, session, llm } = await setup([[stopEvent()]]);
    await engine.prewarm(session);
    expect(llm.prewarmed).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/tutor test`
Expected: FAIL (`./turn-engine` does not exist).

- [ ] **Step 3: Write the implementation**

Create `packages/tutor/src/turn-engine.ts`:

```ts
import type { Chunk, EventType, StreamMessage, TurnRequest, TurnTiming } from "@mento/contracts";
import type { LlmClient, LlmContentBlock, LlmMessage } from "./llm";
import { LlmError } from "./llm";
import { commitAction, prepareAction } from "./action-pipeline";
import { noopDraw, noopJudge, type DrawPipeline, type Judge, type TtsStarter } from "./hooks";
import { buildSystem, buildUserMessage, formatPassages, historyFromEvents } from "./prompt-builder";
import type { PromptSet } from "./prompts";
import type { TurnRepository } from "./repository";
import { retrievalQuery } from "./retrieval-step";
import type { ToolBlock } from "./tool-assembler";
import { SearchMaterialsArgs, modelTools } from "./tools";
import { OrderedQueue, restoreRuntime, type Runtime } from "./turn-runtime";
import type { Retriever } from "@mento/contracts";

export class SessionNotFoundError extends Error {
  constructor(session_id: string) {
    super(`session not found: ${session_id}`);
    this.name = "SessionNotFoundError";
  }
}

export interface TurnEngineDeps {
  llm: LlmClient;
  repo: TurnRepository;
  retriever: Retriever;
  tts: TtsStarter | null;
  draw?: DrawPipeline;
  judge?: Judge;
  prompts: PromptSet;
  models: { tutor: string };
  /** Speak a bridging line when no action was emitted after this many ms. Default 3000. */
  bridgeAfterMs?: number;
  maxTokens?: number;
  /** Max ms to wait for late work (audio alignment, images) before turn_done. Default 15000. */
  pendingTimeoutMs?: number;
  log?: (message: string, extra?: unknown) => void;
}

interface TurnState {
  session_id: string;
  student_id: string;
  modality: "text" | "voice";
  turn_id: string;
  rt: Runtime;
  emit: (m: StreamMessage) => void;
  signal: AbortSignal;
  persist: (e: { type: EventType; payload: unknown }) => void;
  t0: number;
  timing: TurnTiming;
  order: number;
  actionSeq: number;
  emitted: number;
  passages: Chunk[];
  pending: Promise<unknown>[];
  ttsActions: string[];
}

interface RoundResult {
  searches: ToolBlock[];
  /** Every tool block of the round with the outcome the model should be told. */
  results: { block: ToolBlock; outcome: string; is_error: boolean }[];
}

const BRIDGE_TEXT = "Deixa eu pensar um instante…";
const ERROR_TEXT = "O tutor teve um problema. Tente de novo.";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class TurnEngine {
  private readonly runtimes = new Map<string, Runtime>();
  private readonly queues = new Map<string, OrderedQueue>();
  private readonly background = new Set<Promise<unknown>>();

  constructor(private readonly deps: TurnEngineDeps) {}

  private log(message: string, extra?: unknown): void {
    this.deps.log?.(message, extra);
  }

  private now(): number {
    return performance.now();
  }

  private queueFor(session_id: string): OrderedQueue {
    let q = this.queues.get(session_id);
    if (!q) {
      q = new OrderedQueue((err) => this.log("event persistence failed", err));
      this.queues.set(session_id, q);
    }
    return q;
  }

  private async runtime(session_id: string): Promise<Runtime> {
    let rt = this.runtimes.get(session_id);
    if (!rt) {
      rt = restoreRuntime(await this.deps.repo.listEvents(session_id));
      this.runtimes.set(session_id, rt);
    }
    return rt;
  }

  private track<T>(p: Promise<T>): void {
    const tracked = p.catch((err) => this.log("background task failed", err)).finally(() => this.background.delete(tracked));
    this.background.add(tracked);
  }

  /** Wait for background work (judge, persistence). Used by tests and graceful shutdown. */
  async idle(): Promise<void> {
    await Promise.all([...this.background]);
    await Promise.all([...this.queues.values()].map((q) => q.flush()));
  }

  forget(session_id: string): void {
    this.runtimes.delete(session_id);
    this.queues.delete(session_id);
  }

  /** Write the static prefix (tools + system) into the LLM prompt cache at session start. */
  async prewarm(session_id: string): Promise<void> {
    const { repo, llm, prompts, models } = this.deps;
    const session = await repo.getSession(session_id);
    if (!session || !llm.prewarm) return;
    const [classContext, summary, catalog] = await Promise.all([repo.getClassContext(), repo.getLearnerSummary(session.student_id), repo.getCatalog()]);
    await llm.prewarm({ model: models.tutor, system: buildSystem({ prompts, classContext, summary, catalog }), tools: modelTools(), messages: [{ role: "user", content: "." }] });
  }

  async run(session_id: string, req: TurnRequest, emit: (m: StreamMessage) => void, signal: AbortSignal): Promise<{ turn_id: string }> {
    const { repo, retriever, prompts, models } = this.deps;
    const t0 = this.now();
    const session = await repo.getSession(session_id);
    if (!session) throw new SessionNotFoundError(session_id);
    const rt = await this.runtime(session_id);
    rt.turnNo += 1;
    const turn_id = `turn_${rt.turnNo}`;
    const queue = this.queueFor(session_id);
    const persist = (e: { type: EventType; payload: unknown }) => queue.enqueue(() => repo.appendEvent(session_id, e));

    const query = retrievalQuery(req.appended, rt.lastTopic);
    const [classContext, summary, catalog, events, passages] = await Promise.all([
      repo.getClassContext(),
      repo.getLearnerSummary(session.student_id),
      repo.getCatalog(),
      repo.listEvents(session_id),
      query ? retriever.searchChunks({ query, k: 6 }) : Promise.resolve([] as Chunk[]),
    ]);

    // Record what the student did this turn (after reading the history, so it is not counted twice).
    if (req.interrupted) persist({ type: "interrupted", payload: { turn_id: req.interrupted.turn_id, action_id: req.interrupted.action_id } });
    for (const a of req.appended) {
      if (a.name === "user_message") {
        persist({ type: "user_message", payload: { kind: a.kind, text: a.text, selected: a.selected, stt: a.stt } });
      } else {
        persist({ type: "verification_answered", payload: { verification_id: a.verification_id, element_id: a.element_id, answer: a.answer } });
        if (rt.openVerification?.verification_id === a.verification_id) rt.openVerification = undefined;
        const judge = this.deps.judge ?? noopJudge;
        this.track(queue.flush().then(() => judge.start({ session_id, student_id: session.student_id, verification_id: a.verification_id, element_id: a.element_id, answer: a.answer })));
      }
    }

    const state: TurnState = {
      session_id, student_id: session.student_id, modality: req.modality, turn_id, rt, emit, signal, persist, t0,
      timing: { context_ready_ms: Math.round(this.now() - t0) },
      order: 0, actionSeq: 0, emitted: 0, passages: [...passages], pending: [], ttsActions: [],
    };

    const system = buildSystem({ prompts, classContext, summary, catalog });
    const userText = buildUserMessage({
      modality: req.modality,
      history: historyFromEvents(events),
      boardSnapshot: rt.board.snapshot(),
      passages,
      appended: req.appended,
      interrupted: req.interrupted,
    });
    let messages: LlmMessage[] = [{ role: "user", content: userText }];

    try {
      for (let round = 0; round < 2; round++) {
        const result = await this.streamWithRetry(state, models.tutor, system, messages);
        if (signal.aborted) break;
        if (result.searches.length === 0 || round === 1) break;

        const found = await this.runSearches(state, result.searches);
        const assistant: LlmContentBlock[] = result.results.map((r) => ({ type: "tool_use", id: r.block.id, name: r.block.name, input: safeJson(r.block.raw_input) }));
        const toolResults: LlmContentBlock[] = result.results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.block.id,
          content: r.block.name === "search_materials" ? (found.get(r.block.id) ?? "(no results)") : r.outcome,
          is_error: r.is_error || undefined,
        }));
        messages = [...messages, { role: "assistant", content: assistant }, { role: "user", content: toolResults }];
      }
    } catch (err) {
      if (signal.aborted) return this.abort(state);
      this.log("turn failed", err);
      emit({ type: "error", code: "llm_error", message: ERROR_TEXT, recoverable: true });
      return { turn_id };
    }

    if (signal.aborted) return this.abort(state);

    state.timing.script_done_ms = Math.round(this.now() - t0);
    emit({ type: "script_done", turn_id });
    await Promise.race([Promise.allSettled(state.pending), sleep(this.deps.pendingTimeoutMs ?? 15_000)]);
    if (signal.aborted) return this.abort(state);

    emit({ type: "turn_done", turn_id, timing: state.timing });
    persist({ type: "turn_timing", payload: { turn_id, ...state.timing } });
    return { turn_id };
  }

  private abort(state: TurnState): { turn_id: string } {
    for (const id of state.ttsActions) this.deps.tts?.cancel?.(id);
    return { turn_id: state.turn_id };
  }

  private async streamWithRetry(state: TurnState, model: string, system: ReturnType<typeof buildSystem>, messages: LlmMessage[]): Promise<RoundResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.consume(state, model, system, messages);
      } catch (err) {
        if (state.signal.aborted) return { searches: [], results: [] };
        const retryable = err instanceof LlmError && err.retryable;
        if (retryable && attempt === 0 && state.emitted === 0) {
          this.log("retrying the LLM call", err);
          await sleep(300);
          continue;
        }
        throw err;
      }
    }
  }

  private async consume(state: TurnState, model: string, system: ReturnType<typeof buildSystem>, messages: LlmMessage[]): Promise<RoundResult> {
    const result: RoundResult = { searches: [], results: [] };
    const bridge = setTimeout(() => {
      if (state.emitted === 0 && !state.signal.aborted) {
        void this.handleBlock(state, { id: "bridge", name: "speak", raw_input: JSON.stringify({ text: BRIDGE_TEXT }) });
      }
    }, this.deps.bridgeAfterMs ?? 3000);

    try {
      for await (const ev of this.deps.llm.stream({ model, system, tools: modelTools(), messages, max_tokens: this.deps.maxTokens ?? 2048, signal: state.signal })) {
        if (state.signal.aborted) break;
        if (ev.type === "first_token") {
          state.timing.llm_first_token_ms ??= Math.round(this.now() - state.t0);
        } else if (ev.type === "tool_block") {
          if (ev.block.name === "search_materials") {
            result.searches.push(ev.block);
            result.results.push({ block: ev.block, outcome: "", is_error: false });
          } else {
            const outcome = await this.handleBlock(state, ev.block);
            result.results.push({ block: ev.block, outcome: outcome ?? "ok", is_error: outcome !== null });
          }
        }
      }
    } finally {
      clearTimeout(bridge);
    }
    return result;
  }

  /** Validate, send and record one tool call. Returns null on success or the reason it was dropped. */
  private async handleBlock(state: TurnState, block: ToolBlock): Promise<string | null> {
    const { rt } = state;
    const prepared = await prepareAction(block, {
      id: `act_${rt.turnNo}_${state.actionSeq}`,
      verification_id: `ver_${rt.verSeq + 1}`,
      board: rt.board,
      passages: state.passages,
      retriever: this.deps.retriever,
    });
    if (prepared.kind === "dropped") {
      this.log("dropped a tool call", { name: block.name, reason: prepared.reason });
      return `dropped: ${prepared.reason}`;
    }
    state.actionSeq += 1;
    let action = prepared.action;

    if (action.name === "speak" && state.modality === "voice" && this.deps.tts) {
      const actionId = action.id;
      action = { ...action, args: { ...action.args, audio_url: `/api/tts/${actionId}`, audio_format: "pcm_s16le_24000" } };
      state.ttsActions.push(actionId);
      state.pending.push(
        this.deps.tts
          .start({ action_id: actionId, text: action.args.text })
          .then((r) => {
            if (state.signal.aborted) return;
            if (r.first_byte_ms !== null) state.timing.tts_first_byte_ms = Math.min(state.timing.tts_first_byte_ms ?? Infinity, r.first_byte_ms);
            if (r.words.length) state.emit({ type: "speech_alignment", action_id: actionId, words: r.words });
          })
          .catch((err) => this.log("tts failed", err)),
      );
    }

    commitAction(action, state.order++, {
      turn_id: state.turn_id,
      board: rt.board,
      openVerification: rt.openVerification,
      persist: state.persist,
      emit: state.emit,
    });
    if (state.emitted === 0) state.timing.first_action_ms = Math.round(this.now() - state.t0);
    state.emitted += 1;

    if (action.name === "ask_verification") {
      rt.verSeq += 1;
      rt.openVerification = { verification_id: action.args.verification_id, concept_key: action.args.concept_key };
    }
    if (action.name === "write_text") rt.lastTopic = (rt.board.get(action.args.id)?.text ?? "").slice(0, 80);

    if (action.name === "draw") {
      const draw = this.deps.draw ?? noopDraw;
      state.pending.push(
        draw
          .start(action, { session_id: state.session_id, signal: state.signal })
          .then((messages) => {
            if (state.signal.aborted) return;
            if (messages.length) state.timing.image_ready_ms = Math.round(this.now() - state.t0);
            // Late actions join the same ordering as the rest of the script.
            for (const m of messages) state.emit(m.type === "action" ? { ...m, order: state.order++ } : m);
          })
          .catch((err) => this.log("draw failed", err)),
      );
    }
    return null;
  }

  /** Run the model's search_materials calls and return the tool_result text by tool_use id. */
  private async runSearches(state: TurnState, searches: ToolBlock[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const block of searches) {
      const args = SearchMaterialsArgs.safeParse(safeJson(block.raw_input));
      if (!args.success) {
        out.set(block.id, "invalid arguments for search_materials");
        continue;
      }
      const chunks = await this.deps.retriever.searchChunks({ query: args.data.query, k: args.data.k ?? 6, material_id: args.data.material_id, subject: args.data.subject });
      state.passages.push(...chunks);
      out.set(block.id, formatPassages(chunks));
    }
    return out;
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
```

Replace `packages/tutor/src/index.ts`:

```ts
export * from "./action-pipeline";
export * from "./anthropic-llm";
export * from "./board";
export * from "./hooks";
export * from "./llm";
export * from "./prompt-builder";
export * from "./prompts";
export * from "./repository";
export * from "./retrieval-step";
export * from "./sanitize";
export * from "./tool-assembler";
export * from "./tools";
export * from "./turn-engine";
export * from "./turn-runtime";
```

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/tutor test && pnpm --filter @mento/tutor typecheck`
Expected: PASS (all tests in the package). The first line of `setup(...)` has a deliberately simple signature: if the TypeScript conditional type for `rounds` does not compile in your editor, replace it with `rounds: ConstructorParameters<typeof ScriptedLlm>[0]`.

- [ ] **Step 5: Commit**

```bash
git add packages/tutor
git commit -m "feat(whiteboard): turn engine with validation, events, voice, drawing hooks and search round"
```

---

### Task 8: Routes, container wiring and the contract test

**Files:**
- Modify: `apps/api/src/config.ts`, `apps/api/src/container.ts`
- Modify: `apps/api/src/routes/sessions.ts` (replace the stub; Person 1 owns this file: this plan adds the minimal create endpoint, Person 1 swaps the repository behind it)
- Modify: `apps/api/src/routes/turn.ts` (replace the stub)
- Test: `apps/api/src/routes/turn.test.ts`

**Interfaces:**
- Consumes: `TurnEngine`, `AnthropicLlm`, `InMemoryTurnRepository`, `loadPromptsSync`, `emptyRetriever`, `noopDraw`, `noopJudge`, `TtsService` (Plan 2), `sendStreamMessage`, `openSse` (Plan 1).
- Produces: `POST /api/sessions` → `201 { id }`; `POST /api/sessions/:id/turn` (SSE of `StreamMessage`); `POST /api/sessions/:id/end`; container members `repo: TurnRepository` and `engine: TurnEngine | null`; config keys `ANTHROPIC_API_KEY`, `TUTOR_MODEL`, `JUDGE_MODEL`, `PROMPTS_DIR`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/turn.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { StreamMessage, type TurnRequest } from "@mento/contracts";
import { InMemoryTurnRepository, ScriptedLlm, stopEvent, toolEvent } from "@mento/tutor/testing";
import { TurnEngine, noopDraw, noopJudge, emptyRetriever } from "@mento/tutor";
import { buildApp } from "../app";
import { loadConfig } from "../config";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const config = loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv);

async function start() {
  const repo = new InMemoryTurnRepository();
  const llm = new ScriptedLlm([[toolEvent("speak", { text: "Olá! O que vamos estudar?" }), toolEvent("write_text", { id: "title", column: "main", html: "<h1>Vamos começar</h1>" }), stopEvent()]]);
  const engine = new TurnEngine({ llm, repo, retriever: emptyRetriever, tts: null, draw: noopDraw, judge: noopJudge, prompts: { base: "B", subjects: { generic: "G" } }, models: { tutor: "m" } });
  app = await buildApp(config, { repo, engine });
  await app.listen({ port: 0, host: "127.0.0.1" });
  return `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
}

function parseSse(text: string) {
  return text.split("\n\n").map((b) => b.trim()).filter((b) => b && !b.startsWith(":")).map((b) => ({
    event: /^event: (.*)$/m.exec(b)?.[1] ?? "message",
    data: JSON.parse(/^data: (.*)$/m.exec(b)?.[1] ?? "null") as unknown,
  }));
}

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("sessions and turns", () => {
  it("creates a session from a student only, runs a turn and every SSE message satisfies the contract", async () => {
    const base = await start();
    const created = await post(`${base}/api/sessions`, { student_id: "stu_1", modality: "text" });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const turn: TurnRequest = { modality: "text", appended: [] };
    const res = await post(`${base}/api/sessions/${id}/turn`, turn);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = parseSse(await res.text());
    for (const { event, data } of events) expect(event).toBe(StreamMessage.parse(data).type);
    expect(events.map((e) => e.event)).toEqual(["action", "action", "script_done", "turn_done"]);
  });

  it("answers 404 for an unknown session, 400 for a bad body, and ends a session", async () => {
    const base = await start();
    expect((await post(`${base}/api/sessions/nope/turn`, { modality: "text", appended: [] })).status).toBe(404);
    const { id } = (await (await post(`${base}/api/sessions`, { student_id: "s", modality: "text" })).json()) as { id: string };
    expect((await post(`${base}/api/sessions/${id}/turn`, { modality: "fax" })).status).toBe(400);
    expect((await post(`${base}/api/sessions/${id}/end`, { reason: "user_left" })).status).toBe(200);
    expect((await post(`${base}/api/sessions/nope/end`, { reason: "user_left" })).status).toBe(404);
  });

  it("answers 503 for a turn when no LLM is configured", async () => {
    const repo = new InMemoryTurnRepository();
    app = await buildApp(config, { repo, engine: null });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const { id } = (await (await post(`${base}/api/sessions`, { student_id: "s", modality: "text" })).json()) as { id: string };
    expect((await post(`${base}/api/sessions/${id}/turn`, { modality: "text", appended: [] })).status).toBe(503);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/api test`
Expected: FAIL (routes are stubs; container has no `repo`/`engine`).

- [ ] **Step 3: Write the implementation**

Add to the schema in `apps/api/src/config.ts` (inside `z.object({ ... })`, next to the other keys):

```ts
  ANTHROPIC_API_KEY: z.string().default(""),
  TUTOR_MODEL: z.string().default("claude-sonnet-5-5"),
  JUDGE_MODEL: z.string().default("claude-haiku-5-5"),
  PROMPTS_DIR: z.string().default(fileURLToPath(new URL("../../../prompts", import.meta.url))),
```

Replace `apps/api/src/container.ts`:

```ts
import { join } from "node:path";
import {
  AnthropicLlm,
  TurnEngine,
  emptyRetriever,
  loadPromptsSync,
  noopDraw,
  noopJudge,
  type TurnRepository,
} from "@mento/tutor";
import { InMemoryTurnRepository } from "@mento/tutor/testing";
import { createTtsService, mintSttToken, VoiceConfigError, type TtsService } from "@mento/voice/server";
import type { Config } from "./config";
import { MongoService } from "./services/mongo.service";

export interface Container {
  config: Config;
  mongo: MongoService;
  mintSttToken: typeof mintSttToken;
  /** null when ElevenLabs is not configured: the audio route answers 503 and the tutor falls back to captions. */
  tts: TtsService | null;
  /** In memory until Person 1's MongoDB repository replaces it. */
  repo: TurnRepository;
  /** null when ANTHROPIC_API_KEY is not set: the turn route answers 503. */
  engine: TurnEngine | null;
}

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

function buildEngine(config: Config, repo: TurnRepository, tts: TtsService | null): TurnEngine | null {
  if (!config.ANTHROPIC_API_KEY) return null;
  return new TurnEngine({
    llm: new AnthropicLlm({ apiKey: config.ANTHROPIC_API_KEY }),
    repo,
    retriever: emptyRetriever, // Plan 5 replaces this with the MongoDB hybrid search
    tts,
    draw: noopDraw, // Plan 4
    judge: noopJudge, // Plan 4
    prompts: loadPromptsSync(config.PROMPTS_DIR),
    models: { tutor: config.TUTOR_MODEL },
  });
}

export function createContainer(config: Config, overrides: Partial<Container> = {}): Container {
  const tts = "tts" in overrides ? (overrides.tts ?? null) : buildTts(config);
  const repo =
    overrides.repo ??
    new InMemoryTurnRepository({
      catalog: [{ material_id: "demo-roma", title: "História de Roma (demo)", subject: "history", chapters: ["A República", "O Império"] }],
    });
  const engine = "engine" in overrides ? (overrides.engine ?? null) : buildEngine(config, repo, tts);
  return { config, mongo: new MongoService(config.MONGODB_URI), mintSttToken, ...overrides, tts, repo, engine };
}
```

Replace `apps/api/src/routes/sessions.ts`:

```ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateSessionRequest, CreateSessionResponse, EndSessionRequest } from "@mento/contracts";

// Owner: Person 1 (session persistence); the create/end endpoints below are the minimal ones the whiteboard needs.
// POST /api/sessions: the student picks nothing but themselves; the tutor searches all materials.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/sessions",
    { schema: { body: CreateSessionRequest, response: { 201: CreateSessionResponse } } },
    async (request, reply) => {
      const { repo, engine } = request.server.container;
      const { id } = await repo.createSession(request.body);
      engine?.prewarm(id).catch((err) => request.log.warn({ err }, "prompt cache pre-warm failed"));
      return reply.status(201).send({ id });
    },
  );

  app.post(
    "/sessions/:id/end",
    { schema: { params: z.object({ id: z.string().min(1) }), body: EndSessionRequest } },
    async (request, reply) => {
      const { repo, engine, tts } = request.server.container;
      const { id } = request.params;
      if (!(await repo.getSession(id))) return reply.status(404).send({ error: "session_not_found" });
      await repo.endSession(id, request.body.reason);
      engine?.forget(id);
      tts?.cancelAll();
      return { ok: true };
    },
  );
};

export default plugin;
```

Replace `apps/api/src/routes/turn.ts`:

```ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { TurnRequest } from "@mento/contracts";
import { openSse, sendStreamMessage } from "../plugins/sse";

// Owner: Person 3. POST /api/sessions/:id/turn streams the tutor's script (SSE of StreamMessage).
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/sessions/:id/turn",
    { schema: { params: z.object({ id: z.string().min(1) }), body: TurnRequest } },
    async (request, reply) => {
      const { repo, engine } = request.server.container;
      if (!engine) return reply.status(503).send({ error: "tutor_unavailable", message: "ANTHROPIC_API_KEY is not set" });
      const { id } = request.params;
      if (!(await repo.getSession(id))) return reply.status(404).send({ error: "session_not_found" });

      const sse = openSse(request, reply);
      try {
        await engine.run(id, request.body, (m) => sendStreamMessage(sse, m), sse.signal);
      } catch (err) {
        request.log.error({ err }, "turn failed");
        if (!sse.signal.aborted) {
          sendStreamMessage(sse, { type: "error", code: "internal_error", message: "O tutor teve um problema. Tente de novo.", recoverable: true });
        }
      } finally {
        sse.close();
      }
    },
  );
};

export default plugin;
```

Add the `@mento/tutor` export check: `apps/api/package.json` already depends on `@mento/tutor`.

- [ ] **Step 4: Run all checks**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: PASS. (The `/api/ping`, `/api/health`, fixture, voice and tts tests from earlier plans keep passing because `buildApp(config)` without overrides builds a container with `engine: null` when `ANTHROPIC_API_KEY` is empty.)

- [ ] **Step 5: Commit**

```bash
git add apps/api packages
git commit -m "feat(whiteboard): sessions and turn routes wired to the turn engine"
```

---

### Task 9: Day-0 LLM smoke and the latency bench

**Files:**
- Create: `scripts/llm-smoke.ts`
- Create: `scripts/turn-bench.ts`
- Modify: `scripts/package.json` (dependency `@mento/tutor`), root `package.json` (scripts `llm:smoke`, `turn:bench`)
- Modify: `.env.example` (add `ANTHROPIC_API_KEY=`, `TUTOR_MODEL=claude-sonnet-5-5`, `JUDGE_MODEL=claude-haiku-5-5`)

**Interfaces:**
- Consumes: `AnthropicLlm`, `buildSystem`, `buildUserMessage`, `loadPromptsSync`, `modelTools`.
- Produces: `pnpm llm:smoke` (Day-0 check 3: time to first tool block, JSON validity, cache reads) and `pnpm turn:bench` (end-to-end latency report against a running API).

- [ ] **Step 1: Add dependencies and script entries**

Run: `pnpm --filter @mento/scripts add @mento/tutor@workspace:*`
In the root `package.json` `scripts` add: `"llm:smoke": "tsx scripts/llm-smoke.ts"` and `"turn:bench": "tsx scripts/turn-bench.ts"`. Append to `.env.example`: `ANTHROPIC_API_KEY=`, `TUTOR_MODEL=claude-sonnet-5-5`, `JUDGE_MODEL=claude-haiku-5-5`.

- [ ] **Step 2: Write the LLM smoke script**

Create `scripts/llm-smoke.ts`:

```ts
import { fileURLToPath } from "node:url";
import { Action } from "@mento/contracts";
import { AnthropicLlm, buildSystem, buildUserMessage, loadPromptsSync, modelTools } from "@mento/tutor";

process.loadEnvFile(new URL("../.env", import.meta.url));
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env");
const model = process.env.TUTOR_MODEL ?? "claude-sonnet-5-5";

const prompts = loadPromptsSync(fileURLToPath(new URL("../prompts", import.meta.url)));
const system = buildSystem({
  prompts,
  classContext: { grade_level: "8º ano", description: "Turma participativa, gosta de exemplos do cotidiano." },
  summary: { open_gaps: [{ concept: "Fim da República", concept_key: "fim da republica", description: "Confunde República e Império", confidence: 0.6 }], recent_progress: [] },
  catalog: [{ material_id: "demo-roma", title: "História de Roma (demo)", subject: "history", chapters: ["A República", "O Império"] }],
});
const tools = modelTools();
const llm = new AnthropicLlm({ apiKey });

const scenarios = [
  { name: "opening", user: buildUserMessage({ modality: "voice", history: [], boardSnapshot: "(the board is empty)", passages: [], appended: [] }) },
  {
    name: "question",
    user: buildUserMessage({
      modality: "voice", history: [], boardSnapshot: "(the board is empty)",
      passages: [{ id: "c1", material_id: "demo-roma", subject: "history", chapter: "O Império", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto, e Roma passou a ser governada por um imperador." }],
      appended: [{ name: "user_message", kind: "speech", text: "Quem foi Augusto e por que ele é importante?" }],
    }),
  },
];

console.log(`model: ${model}; tools: ${tools.length}`);
await llm.prewarm?.({ model, system, tools, messages: [{ role: "user", content: "." }] }).then(
  () => console.log("prewarm: ok"),
  (e) => console.log(`prewarm: failed (${(e as Error).message})`),
);

for (const s of scenarios) {
  for (let run = 1; run <= 3; run++) {
    const t0 = performance.now();
    let firstToken = 0;
    let firstBlock = 0;
    let blocks = 0;
    let valid = 0;
    let usage = "";
    for await (const ev of llm.stream({ model, system, tools, messages: [{ role: "user", content: s.user }], max_tokens: 2048 })) {
      if (ev.type === "first_token" && !firstToken) firstToken = performance.now() - t0;
      if (ev.type === "tool_block") {
        if (!firstBlock) firstBlock = performance.now() - t0;
        blocks++;
        try {
          const args = JSON.parse(ev.block.raw_input);
          if (ev.block.name === "search_materials" || Action.safeParse({ id: "x", name: ev.block.name, args: ev.block.name === "ask_verification" ? { ...args, verification_id: "v", concept_key: "k" } : args }).success) valid++;
        } catch {
          /* counted as invalid */
        }
      }
      if (ev.type === "stop") usage = JSON.stringify(ev.usage ?? {});
    }
    console.log(`${s.name} #${run}: first token ${firstToken.toFixed(0)} ms, first tool block ${firstBlock.toFixed(0)} ms, total ${(performance.now() - t0).toFixed(0)} ms, ${valid}/${blocks} valid blocks, usage ${usage}`);
  }
}
```

- [ ] **Step 3: Write the latency bench**

Create `scripts/turn-bench.ts`:

```ts
const API = process.env.API_URL ?? "http://localhost:4000";
const RUNS = Number(process.argv[2] ?? 3);

const script = [
  { modality: "text", appended: [] },
  { modality: "text", appended: [{ name: "user_message", kind: "chat", text: "Quero aprender sobre o fim da República romana." }] },
  { modality: "text", appended: [{ name: "user_message", kind: "chat", text: "Quem foi Augusto?" }] },
];

const q = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : NaN);

async function runTurn(sessionId: string, body: unknown) {
  const t0 = performance.now();
  const res = await fetch(`${API}/api/sessions/${sessionId}/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(`turn failed: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const seen: { type: string; at: number; data: any }[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const type = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (type && data) seen.push({ type, at: performance.now() - t0, data: JSON.parse(data) });
    }
  }
  return {
    first_action: seen.find((m) => m.type === "action")?.at ?? NaN,
    script_done: seen.find((m) => m.type === "script_done")?.at ?? NaN,
    turn_done: seen.find((m) => m.type === "turn_done")?.at ?? NaN,
    errors: seen.filter((m) => m.type === "error").length,
  };
}

const rows: Record<string, number[]> = { first_action: [], script_done: [], turn_done: [] };
let errors = 0;
for (let r = 1; r <= RUNS; r++) {
  const created = await fetch(`${API}/api/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ student_id: "bench", modality: "text" }) });
  const { id } = (await created.json()) as { id: string };
  await new Promise((res) => setTimeout(res, 1500)); // let the cache pre-warm finish
  for (const [n, body] of script.entries()) {
    const t = await runTurn(id, body);
    errors += t.errors;
    for (const k of Object.keys(rows)) rows[k]!.push(t[k as keyof typeof t] as number);
    console.log(`session ${r} turn ${n + 1}: first action ${t.first_action.toFixed(0)} ms, script done ${t.script_done.toFixed(0)} ms, turn done ${t.turn_done.toFixed(0)} ms`);
  }
}
console.log("\nTargets (spec §1): first action p50 ≤ 1500 ms, p95 ≤ 2200 ms");
for (const [k, xs] of Object.entries(rows)) console.log(`${k.padEnd(13)} p50 ${q(xs, 0.5).toFixed(0)} ms, p95 ${q(xs, 0.95).toFixed(0)} ms (n=${xs.length})`);
console.log(`errors: ${errors}`);
```

- [ ] **Step 4: Run them (needs the real key in `.env`)**

Run: `pnpm llm:smoke`
Expected: `prewarm: ok`, then 3 runs per scenario with `first tool block` times, `N/N valid blocks`, and `usage` showing `cache_read_input_tokens` greater than 0 from the second run on. Record the numbers in spec §11 (Day-0 check 3). If `prewarm: failed` or blocks are invalid, copy the message: it is the first thing to fix.

Then, with `pnpm dev:api` running in another terminal: `pnpm turn:bench 3`
Expected: one line per turn and a p50/p95 summary to compare with the targets of spec §1.

- [ ] **Step 5: Commit**

```bash
git add scripts package.json .env.example pnpm-lock.yaml
git commit -m "feat(whiteboard): Day-0 LLM smoke script and the end-to-end turn latency bench"
```

---

## Self-review

- **Spec coverage:** §2 flow (session without material, opening turn, end) → Tasks 4, 7, 8; §4 board ids and server validation → Task 2, 6; §6 models, eager streaming, cache layout, short-first rule, validation, persistence off the critical path, hint/verification events, failure handling (timeouts via abort, bridge, one retry, `error` message) → Tasks 3–7; §6.1 pre-retrieval, `search_materials` round, citation validation, `outside_material` prompt rule → Tasks 4, 6, 7; §8 measurement (`turn_timing`) and bench → Tasks 7, 9; §9 tests 2 and 4 (contract through the real SSE; abort cancels TTS/LLM) → Tasks 7, 8; prewarm → Task 7. Not here by design: real image jobs and the judge (Plan 4: hooks exist), the real retriever (Plan 5: `emptyRetriever` until then), `DEMO_MODE=fixture` replay (the fixture endpoint from Plan 1 already serves recorded turns), Math profile.
- **Placeholders:** none; the only conditional instruction (SDK type names in Task 5, a type alias in Task 7) has the exact fallback.
- **Type consistency:** `ToolBlock`, `LlmClient`/`LlmEvent`/`LlmRequest`, `TurnRepository`, `TtsStarter`/`DrawPipeline`/`Judge`, `Runtime`, `PrepareContext`/`CommitContext`, `TurnEngine`/`TurnEngineDeps` and the container members `repo`/`engine` are named identically in every task; `SpeakBase`/`WriteTextBase`/`AskVerificationBase` come from Plan 1 as amended.
