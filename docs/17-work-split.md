# 17 — Work split (3 people, parallel, minimal conflicts)

> Status: **proposed**; names are not assigned yet (Lane A/B/C ↔ person 1/2/3). Hour estimates are rough and unverified. Last updated: 2026-10-30.
> Inputs: `01-hackathon-scope.md` (Must/Should/Nice), `16-technical-roadmap.md` (architecture), `10-decisions.md` (D24, D25).
> **Update 2026-10-30:** the final split among the three people is in **`../workstreams/`** (start with `workstreams/README.md`). Mapping: **Lane A → Person 2** (whiteboard front-end), **Lane B → Person 3** (whiteboard back-end, **plus `packages/voice`**), **Lane C → Person 1** (teacher interface, data, sources, analysis). Where this document and `workstreams/` differ, `workstreams/` wins.

## 1. Principles

1. **Independence by contract.** The lanes talk only through a few frozen contracts (schemas, one interface, fixtures). Each lane builds against **mocks of the others**, so nobody waits.
2. **Ownership by directory.** Every path has one owner. Edit only your paths; ask the owner for changes elsewhere.
3. **Must first, always.** Inside each lane the order is Must → Should → Nice. The **cut line is at hour 18**.
4. **Integrate early and often.** Three checkpoints (H8, H14, H18), not one big merge at the end.
5. **No over-engineering.** A light pnpm-workspace monorepo (no Turborepo/Nx), no extra services.

## 2. Stack (decided; see D24)

| Layer | Choice |
|---|---|
| Language | **TypeScript** everywhere (frontend, backend, scripts) |
| Apps | **Next.js** frontend only (`apps/web`) + **Fastify API** (`apps/api`, SSE/real-time, D43); internal packages in `packages/*` (`21-repo-structure.md`) |
| Contracts | **Zod** schemas shared by client and server |
| Styling | Tailwind; handwriting fonts from Google Fonts |
| DB | **MongoDB** via **Mongoose** (D46) |
| LLM / STT / TTS / image | Provider SDKs called directly; choices come from the day-0 bake-offs (`16` §12) |
| Scripts | `tsx` (`scripts/ingest.ts`, `scripts/pregenerate-images.ts`) |
| Demo hosting | Run on a laptop or a small VM with Node (serverless limits SSE; the database is a MongoDB instance (local or Atlas)) |

Repository layout: a **light pnpm-workspace monorepo** (`apps/web` + `packages/*`), fully described in `21-repo-structure.md` (D28). Package ↔ lane mapping:

| Lane | Packages and paths |
|---|---|
| A | `packages/board`, `packages/ui` (after kickoff), `apps/web/src/app/(student)`, `apps/web/public/brand` |
| B | `packages/tutor`, `packages/voice`, `prompts/`, the `turn` route, the voice/TTS routes, `scripts/turn-cli.ts`, `scripts/pregenerate-images.ts` |
| C | `packages/db`, `packages/sources`, `packages/analysis`, `apps/web/src/app/(teacher)`, other API routes, `scripts/seed.ts`, `scripts/ingest.ts` |
| Shared | `packages/contracts` (frozen), `apps/api/src/container.ts` and `server.ts`, root configs; `fixtures/` (A and B add files); `assets/` (founder) |

Repository: https://github.com/ericlbarreto/mento (`main`). Everyone clones it before the kickoff; the workspace skeleton (K1) is committed by one person and the others pull.

## 3. Kickoff: first 90 minutes, all three together

Nothing else starts before this is done. One person types; all three agree.

| # | Deliverable | Where |
|---|---|---|
| K1 | Repo skeleton (Next.js web + **Fastify API** + TS + Tailwind + Zod + MongoDB/Mongoose), `pnpm dev` starts both for everyone, `.env.example` | root |
| K2 | **Action/tool schemas** (Zod) for every tool in `16` §4 | `packages/contracts/src/actions.ts` |
| K3 | **SSE message schema** (`order`, `action`, `stream`, `done`) and **event log shape** | `packages/contracts/src/stream.ts`, `events.ts` |
| K4 | **Citation format** `{material_id, page, quote}` (canonical: `workstreams/contracts-spec.md`) | `packages/contracts/src/citation.ts` |
| K5 | **`Repository` interface** (create session, append event, list events, insert evidence, get class context, get/search material pages, list materials/students/insights, update insight status) + an **in-memory implementation** everyone can use as a stub | `packages/contracts/src/repository.ts`, `packages/db/src/memory.ts` |
| K6 | **`SpeechPlayer` interface** (`speak(text, opts) → Promise`, `stop()`, optional word callbacks) + a text-only default (captions) | `packages/contracts/src/speech.ts` |
| K7 | **Fixtures:** 3 scripts (happy path with timeline + draw + citation; click-and-ask; verification with a wrong answer) and 1 event log | `fixtures/` |
| K8 | Day-0 bake-off assignments (below) | — |
| K9 | **Design tokens + base UI components** (`Button`, `Card`, `Chip`, `Avatar/Mascot`, theme CSS variables from the brand colors) so both interfaces share one look (`18-ui-references.md`), **and copy the brand files** `assets/brand/*` and the 4 mascot GIFs into `apps/web/public/brand/` (`19-brand-assets.md` §5) | `packages/ui/`, `apps/web/public/brand/` |

After kickoff the contracts are **frozen**. Changes are additive only and need a short message to the other two plus a PR.

### Day-0 checks (run in parallel after kickoff, ≤ 1.5 h)

| Check | Owner |
|---|---|
| Handwriting font renders pt-BR accents (ã ç é õ) | Lane A |
| Image-model bake-off (3 Rome prompts: style, latency, cost, background removal) and LLM tool-call reliability on a fixture script | Lane B |
| STT (Deepgram token + WebSocket) and TTS (ElevenLabs / Azure / Cartesia) in pt-BR | Lane B |

## 4. Lanes

### Lane A — Board + student UI **(Person 2)**
**Owns:** `packages/board/`, `apps/web/src/app/(student)/`, `fixtures/` (own files), the dev fixture route.
**Builds against:** a **fixture replay endpoint** (`/api/dev/fixture-turn?name=...`) that streams a fixture through the real SSE format. Does not need the LLM, DB or voice.

| Tier | Task | Est. |
|---|---|---|
| Must 1 | Board skeleton: spaces/columns, element registry, scroll | 3 h |
| Must 1 | Action queue + playback (`speak` clock, instant actions, placeholders), pause, **interruption** (abort + clear) | 4 h |
| Must 1 | Renderers: `write_text` (typewriter + pencil), `write_timeline`, `image`, `svg` (+noise filter), HTML/SVG sanitizer | 4 h |
| Must 1 | `highlight` (blob marker) and `circle_annotate` (substring + stroke-dash animation) | 2 h |
| Must 2 | Chat panel, text input, captions (default text-only `SpeechPlayer`) | 2 h |
| Must 2 | **Click-and-ask** UI (select element/text → `board_select` event) | 2 h |
| Must 5 | Source chips + **pdf.js viewer** at page with quote highlight in the text layer | 4 h |
| Must 8 | Start screen: **pick your name → pick a material (+ optional topic)** → start; session create call | 1.5 h |
| Must 2 | **Orb at bottom center**: the **Mento mascot** (stacked GIFs, opacity toggle; static PNG for reduced motion) + a Canvas/SVG **ring** for states idle/listening/thinking/speaking/waiting (amplitude from `SpeechPlayer`/mic, stub = caption progress); mapping in `19-brand-assets.md` §4 | 2.5 h |
| Nice 13 | "My progress" (student view) | 2 h |
| Nice 15 | Resume session from the event log | 1.5 h |
| Nice 14 | Replay of a board moment (for the teacher) | 3 h |

**Must total ≈ 24 h** (heaviest UI lane; start with the skeleton and the queue; the orb can slip to Should if needed).
**Exposes:** the student app; a `SpeechPlayer` consumer slot. **Consumes:** SSE `/turn`, `GET /events`, `/files/:id`.

### Lane B — Tutor core **(Person 3; also owns `packages/voice`)**
**Owns:** `packages/tutor/`, `packages/voice/`, `prompts/`, `apps/api/src/routes/turn.ts`, `voice.ts`, `dev-fixtures.ts`, `scripts/turn-cli.ts`, `scripts/pregenerate-images.ts`, image/SVG generation code.
**Builds against:** the in-memory `Repository` (K5) and a CLI (`scripts/turn-cli.ts`) that prints the SSE script, so it needs **no UI**.

| Tier | Task | Est. |
|---|---|---|
| Must 3 | `prompts/base.md`, `prompts/subjects/history.md`, `generic.md`, persona file; **class-context layer** (grade-level register for 7º–9º ano) and **learner summary** (open gaps); iterate on the Rome script | 4 h (continuous) |
| Must 1–2 | **Turn handler:** assemble prompt (3 layers: base + subject profile + course context = class context + retrieved material pages + learner summary + topic; plus **board snapshot** + recent events), streaming LLM with tools, schema validation, SSE emit, abort handling | 5 h |
| Must 1 | `draw` artistic pipeline: placeholder → image model → store → `draw_result`; cache by prompt hash; pregeneration script | 3 h |
| Must 4 | Grounding in the turn: **FTS retrieval scoped to the chosen material** (+ `search_materials`), `sources` on actions, `outside_material`, uses the citation validator from Lane C | 3 h |
| Must 6 | `ask_verification` + **judge call** + `record_evidence` through the Repository | 3 h |
| Should | Structured SVG pipeline (streamed chunks) | 3 h |
| Should 11 | **Voice (Person 3):** ephemeral token endpoint, Deepgram STT hook, TTS proxy + `SpeechPlayer` implementation with word captions and an **audio level** value for the orb, mic auto-open (`useAudioLevel`) | 6.5 h |
| Nice 12 | `prompts/subjects/math.md` | 1.5 h |
| Nice 18 | Exam/question generation (future) | — |

**Must total ≈ 21 h; Should ≈ 10 h** (voice 6.5 h + structured SVG 3 h).
**Exposes:** `POST /api/sessions/:id/turn` (SSE). **Consumes:** `Repository`, `packages/sources` (material pages/search, citation validator), `contracts`.

### Lane C — Data, sources, teacher **(Person 1; voice moved to Person 3)**
**Owns:** `packages/db/`, `packages/sources/`, `packages/analysis/`, `apps/web/src/app/(teacher)/`, `scripts/ingest.ts`, session/events/teacher API routes, DB seed.
**Builds against:** seeded data and fixture event logs. Needs neither the board nor the LLM (analysis can run on fixture logs).

| Tier | Task | Est. |
|---|---|---|
| Must 7–8 | **Schema (9 tables: `class_context`, `materials`, `chunks`, `students`, `sessions`, `events`, `evidence`, `analyses`, `insights`) + repository implementation + seed** (students real/simulated, class context "8º ano", demo insights). `memory.ts` parity. **Deliver first (≤ H3)**: Lane B switches from the stub to it | 3.5 h |
| Must 7 | Session and events API (`POST /api/sessions`, `GET /events`), student list for the picker, `/api/files/:id` | 2 h |
| Must 4 | **Ingestion pipeline** (PDF → text layer + vision for pages that need it → chunks → FTS index → outline; status; script entry point) and **citation validator** (`quote` must occur in the chunk) | 6 h |
| Should 9a | **Students tab** (Flint-inspired layout from `18`): overview metrics (`/api/overview`), student list, **create student**, **student detail** (evolution, gaps with evidence, suggestions, accept/dismiss); "simulated data" badge; uses `packages/ui/**` | 8 h |
| Should 9b | **Class context** card + `GET/PUT /api/class-context` | 1.5 h |
| Should 9c | **Materials tab**: upload (`POST /api/materials`), background ingestion job with status updates (live feed or polling), list | 5 h |
| Should 10 | **Post-session analysis → insights** (automatic after each conversation: counters + structured LLM call → `analyses` + `insights` rows), evolution aggregates, simulated students | 5 h |
| Nice 16 | Delete/rename/re-process materials; progress per page | 2 h |

**Must total ≈ 11.5 h**; **Should total ≈ 20.5 h** after voice moved to Person 3 (still the heaviest Should load). Rebalancing options: after its Must, **Lane A takes the presentational teacher components** (tables, cards, charts on `packages/ui`) while C keeps the APIs and the analysis; and follow the **cut order in `01-hackathon-scope.md`**. Lane C **supports integration** at H8 and H14.
**Exposes:** `Repository` implementation, `packages/sources` API, teacher pages, `SpeechPlayer`. **Consumes:** `contracts`.

## 5. Tier-by-lane map (nothing falls between the lanes)

| Scope item (`01-hackathon-scope.md`) | Lane |
|---|---|
| Must 1 Board with live writing/drawing | A (render), B (script, drawing) |
| Must 2 Two-way text conversation + click-and-ask | A (UI), B (turn loop) |
| Must 3 Layered prompt (base + subject profile + class context + material excerpts + learner summary) | B |
| Must 4 Material ingestion, retrieval scoped to the chosen material, citations, outside-material | C (ingestion, validator), B (retrieval in the turn) |
| Must 5 Source chips + PDF at the excerpt | A |
| Must 6 Evidence recording | B (judge), C (storage) |
| Must 7 Conversations and event log persisted per student | C |
| Must 8 Students + class context exist (seed) and the start screen (name → material → topic) | C (seed), A (screen) |
| Should 9a Students tab (metrics, list, create, detail) | C (APIs, page), optionally A (components) |
| Should 9b Class context card | C |
| Should 9c Materials tab (upload, status) | C |
| Should 10 Post-session analysis → insights | C |
| Should 11 Voice | B (Person 3: server + client hooks), A (player UI and orb) |
| Nice 12–18 | per the lane tables |

## 6. Integration checkpoints

| Hour | Checkpoint | What gets connected | Who drives |
|---|---|---|---|
| 0–1.5 | **Kickoff** | Contracts, fixtures, skeleton | All |
| ~3 | Repo swap | B moves from in-memory stub to C's MongoDB repository | C |
| **8** | **Integration 1** | A switches from fixtures to B's real `/turn`; end-to-end text turn with a real LLM | A + B |
| **14** | **Integration 2** | Citations (C validator ↔ B ↔ A chips) and evidence (B ↔ C ↔ teacher card) | B + C |
| **18** | **Cut line / Must demo** | Full Rome demo script run end to end by all three | All |
| 22 | **Feature freeze** | Only bug fixes after this | All |
| 22–24 | Rehearsal ×2, image pre-generation, fallback checks | | All |

If Must is not green at H18, **nobody starts Should**; everyone helps close Must.

## 7. Avoiding merge conflicts

**Ownership table** (the full path-by-path version with `apps/web` routes is in `21-repo-structure.md` §9)

| Path | Owner | Others may |
|---|---|---|
| `packages/contracts/**` | Shared (frozen) | Additive PR only, with a message to the other two |
| `packages/ui/**`, `apps/web/public/brand/**` | Shared at kickoff, then Lane A | Additive PR; Lane C consumes them for the teacher UI |
| `assets/**` | Founder | Read only; never edit or import from code |
| `packages/board/**`, `apps/web/src/app/(student)/**` | A | Read only |
| `packages/tutor/**`, `packages/voice/**`, `prompts/**` | B | Read only |
| `packages/db/**`, `packages/sources/**`, `packages/analysis/**`, `apps/web/src/app/(teacher)/**` | C | Read only |
| `package.json` / lockfile / root configs | Shared | Small PRs; after a merge, others `git pull --rebase` and `pnpm install` |
| `.env.example` | Shared | Append only |
| `fixtures/` | A and B | Add **new files**; never edit another lane's fixture |
| DB migrations/schema | **C only** | Request changes to C (they are small) |
| `docs/` | Lane that changes the behavior | Update the relevant doc in the same PR |

**Git rules**

- Trunk-based with short branches: `feat/a-board-queue`, `feat/b-turn-handler`, `feat/c-ingest`. **No branch lives longer than ~3 hours.**
- Open small PRs into `main` often; run `git pull --rebase origin main` before opening.
- One owner per PR review: the owner of the path being changed; shared files need one other person's quick look.
- Never commit secrets, `.env`, PDFs or database dumps.
- Don't force-push `main`.
- If you need something from another lane, **write a one-line request** in the team chat with the exact interface you expect; keep working against the stub meanwhile.

**Why these seams are safe**

- A never imports from `packages/tutor` or `packages/db`; it only calls HTTP endpoints and uses `contracts`.
- B never imports UI code; it imports `contracts` and the `Repository` interface (stub first, real later).
- C implements the `Repository` and owns the schema; changes to the interface go through the additive-PR rule.

## 8. Working with AI agents in parallel

- Start each session with *"Study the repository"*, then tell the agent: *"I am Lane X; only edit these paths: …"*.
- Ask agents to run `npm run typecheck` and the fixture tests before opening a PR.
- Do not let two agents edit `packages/contracts/**` at the same time.

## 9. Definition of done

**Lane A Must:** fixture scripts play correctly (write, highlight, circle, draw placeholder → image, timeline); interruption works; click-and-ask sends `board_select`; chips open the PDF at the highlighted quote.
**Lane B Must:** `turn-cli` with the Rome material returns valid scripts (adapted to the class context) for the happy path, a wrong answer and an out-of-material question; images are cached; evidence is recorded.
**Lane C Must:** ingest script produces chunks for the Rome PDFs; citation validator rejects fake quotes; sessions and events persist and reload; seed script runs on a clean checkout.
**Demo ready (H18):** the 7-step script in `01-hackathon-scope.md` runs live, twice in a row, from a clean start.

## 10. When a lane is blocked or finished early

| Lane | Pull next from |
|---|---|
| A | Nice 13 "My progress", Nice 15 resume, polish of animations, mobile/laptop layout, accessibility basics |
| B | Structured SVG, voice tuning, prompt regression suite, Nice 12 Math profile |
| C | Nice 16 materials management, read-only conversation replay (Nice 14), help A with the teacher components or B with the judge |

Anyone who finishes early **reviews and tests another lane's output** against the fixtures before starting a new feature.
