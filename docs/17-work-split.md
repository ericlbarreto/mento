# 17 — Work split (3 people, parallel, minimal conflicts)

> Status: **proposed**; names are not assigned yet (Lane A/B/C ↔ person 1/2/3). Hour estimates are rough and unverified. Last updated: 2026-10-30.
> Inputs: `01-hackathon-scope.md` (Must/Should/Nice), `16-technical-roadmap.md` (architecture), `10-decisions.md` (D24, D25).

## 1. Principles

1. **Independence by contract.** The lanes talk only through a few frozen contracts (schemas, one interface, fixtures). Each lane builds against **mocks of the others**, so nobody waits.
2. **Ownership by directory.** Every path has one owner. Edit only your paths; ask the owner for changes elsewhere.
3. **Must first, always.** Inside each lane the order is Must → Should → Nice. The **cut line is at hour 18**.
4. **Integrate early and often.** Three checkpoints (H8, H14, H18), not one big merge at the end.
5. **No over-engineering.** One Next.js project, no monorepo tooling, no extra services.

## 2. Stack (decided; see D24)

| Layer | Choice |
|---|---|
| Language | **TypeScript** everywhere (frontend, backend, scripts) |
| App | **Next.js** (App Router): React UI + route handlers for the API; one project |
| Contracts | **Zod** schemas shared by client and server |
| Styling | Tailwind; handwriting fonts from Google Fonts |
| DB | **SQLite** file (Drizzle or `better-sqlite3`) |
| LLM / STT / TTS / image | Provider SDKs called directly; choices come from the day-0 bake-offs (`16` §12) |
| Scripts | `tsx` (`scripts/ingest.ts`, `scripts/pregenerate-images.ts`) |
| Demo hosting | Run on a laptop or a small VM with Node (serverless limits SSE and breaks file-based SQLite) |

Planned layout (the only structure changes happen at kickoff):

```
src/contracts/      Zod schemas + Repository interface + fixtures      (frozen at kickoff)
src/ui/             design tokens + shared components (see 18)         (frozen at kickoff, then Lane A)
public/brand/       logo, mascot and mascot GIFs (copied from assets/) (Lane A; assets/ belongs to the founder)
assets/             brand source files, do not import from code        (founder)
src/board/          DOM board, action queue, renderers                 (Lane A)
src/app/(student)/  student pages                                      (Lane A)
src/tutor/          turn handler, LLM loop, tool validation, drawing   (Lane B)
src/db/             schema, repository implementation, seed            (Lane C)
src/sources/        ingestion, chunks, citation validation             (Lane C)
src/analysis/       post-session analysis                              (Lane C)
src/voice/          STT hook, TTS proxy/player                         (Lane C)
src/app/(teacher)/  teacher pages                                      (Lane C)
src/app/api/        route handlers (each file owned by the lane of its feature)
prompts/            base, subjects, personas                           (Lane B)
scripts/            ingest, pregenerate-images, turn-cli               (see ownership)
fixtures/           example scripts/event logs                         (A and B add files; never edit others')
materials/          PDFs (git-ignored)
```

Repository: https://github.com/ericlbarreto/mento (`main`). Everyone clones it before the kickoff; the Next.js skeleton (K1) is committed by one person and the others pull.

## 3. Kickoff: first 90 minutes, all three together

Nothing else starts before this is done. One person types; all three agree.

| # | Deliverable | Where |
|---|---|---|
| K1 | Repo skeleton (Next.js + TS + Tailwind + Zod + SQLite), `npm run dev` works for everyone, `.env.example` | root |
| K2 | **Action/tool schemas** (Zod) for every tool in `16` §4 | `src/contracts/actions.ts` |
| K3 | **SSE message schema** (`order`, `action`, `stream`, `done`) and **event log shape** | `src/contracts/stream.ts`, `events.ts` |
| K4 | **Citation format** `{source_id, page, quote}` | `src/contracts/citation.ts` |
| K5 | **`Repository` interface** (create session, append event, list events, insert evidence, get lesson pages, list subjects/students/analysis) + an **in-memory implementation** everyone can use as a stub | `src/contracts/repository.ts`, `src/db/memory.ts` |
| K6 | **`SpeechPlayer` interface** (`speak(text, opts) → Promise`, `stop()`, optional word callbacks) + a text-only default (captions) | `src/contracts/speech.ts` |
| K7 | **Fixtures:** 3 scripts (happy path with timeline + draw + citation; click-and-ask; verification with a wrong answer) and 1 event log | `fixtures/` |
| K8 | Day-0 bake-off assignments (below) | — |
| K9 | **Design tokens + base UI components** (`Button`, `Card`, `Chip`, `Avatar/Mascot`, theme CSS variables from the brand colors) so both interfaces share one look (`18-ui-references.md`), **and copy the brand files** `assets/brand/*` and the 4 mascot GIFs into `public/brand/` (`19-brand-assets.md` §5) | `src/ui/`, `public/brand/` |

After kickoff the contracts are **frozen**. Changes are additive only and need a short message to the other two plus a PR.

### Day-0 checks (run in parallel after kickoff, ≤ 1.5 h)

| Check | Owner |
|---|---|
| Handwriting font renders pt-BR accents (ã ç é õ) | Lane A |
| Image-model bake-off (3 Rome prompts: style, latency, cost, background removal) and LLM tool-call reliability on a fixture script | Lane B |
| STT (Deepgram token + WebSocket) and TTS (Cartesia / ElevenLabs / Azure) in pt-BR | Lane C |

## 4. Lanes

### Lane A — Board + student UI
**Owns:** `src/board/`, `src/app/(student)/`, `fixtures/` (own files), the dev fixture route.
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
| Must | Start screen: choose subject/lesson/persona; session create call | 1.5 h |
| Must 2 | **Orb at bottom center**: the **Mento mascot** (stacked GIFs, opacity toggle; static PNG for reduced motion) + a Canvas/SVG **ring** for states idle/listening/thinking/speaking/waiting (amplitude from `SpeechPlayer`/mic, stub = caption progress); mapping in `19-brand-assets.md` §4 | 2.5 h |
| Nice 12 | "My progress" (student view) | 2 h |
| Nice 15 | Resume session from the event log | 1.5 h |
| Nice 14 | Replay of a board moment (for the teacher) | 3 h |

**Must total ≈ 24 h** (heaviest UI lane; start with the skeleton and the queue; the orb can slip to Should if needed).
**Exposes:** the student app; a `SpeechPlayer` consumer slot. **Consumes:** SSE `/turn`, `GET /events`, `/files/:id`.

### Lane B — Tutor core
**Owns:** `src/tutor/`, `prompts/`, `src/app/api/sessions/[id]/turn`, `scripts/turn-cli.ts`, `scripts/pregenerate-images.ts`, image/SVG generation code.
**Builds against:** the in-memory `Repository` (K5) and a CLI (`scripts/turn-cli.ts`) that prints the SSE script, so it needs **no UI**.

| Tier | Task | Est. |
|---|---|---|
| Must 3 | `prompts/base.md`, `prompts/subjects/history.md`, persona file; iterate on the Rome script | 3 h (continuous) |
| Must 1–2 | **Turn handler:** assemble prompt (3 layers + lesson pages + learner summary + **board snapshot** + recent events), streaming LLM with tools, schema validation, SSE emit, abort handling | 5 h |
| Must 1 | `draw` artistic pipeline: placeholder → image model → store → `draw_result`; cache by prompt hash; pregeneration script | 3 h |
| Must 4 | Grounding in the turn: pages in context, `sources` on actions, `outside_material`, uses the citation validator from Lane C | 2 h |
| Must 6 | `ask_verification` + **judge call** + `record_evidence` through the Repository | 3 h |
| Should 9 | Structured SVG pipeline (streamed chunks) | 3 h |
| Nice 11 | `prompts/subjects/math.md` | 1.5 h |
| Nice 18 | Exam/question generation (future) | — |

**Must total ≈ 19 h.**
**Exposes:** `POST /api/sessions/:id/turn` (SSE). **Consumes:** `Repository`, `src/sources` (lesson pages, citation validator), `contracts`.

### Lane C — Data, sources, teacher, voice
**Owns:** `src/db/`, `src/sources/`, `src/analysis/`, `src/voice/`, `src/app/(teacher)/`, `scripts/ingest.ts`, session/events/teacher API routes, DB seed.
**Builds against:** seeded data and fixture event logs. Needs neither the board nor the LLM (analysis can run on fixture logs).

| Tier | Task | Est. |
|---|---|---|
| Must 7 | **Schema + repository implementation + seed** (9 tables, `memory.ts` parity). **Deliver first (≤ H3)**: Lane B switches from the stub to it | 3 h |
| Must 7 | Session and events API (`POST /api/sessions`, `GET /events`), `/files/:id` | 2 h |
| Must 4 | **Ingestion script** (PDF → per-page Markdown → chunks) and **citation validator** (`quote` must occur in the chunk) | 5 h |
| Should 8 | Teacher page (Flint-inspired layout from `18`): sidebar, materials per subject/lesson, insight card, student table, student card (concepts, misconceptions with evidence, what seems to work with `n`, next action); "simulated data" badge; uses `src/ui/**` | 6 h |
| Should 9 | Post-session analysis job (counters + structured LLM call) and simulated students | 4 h |
| Should 10 | Voice: ephemeral token endpoint, Deepgram STT hook, TTS proxy + `SpeechPlayer` implementation with word captions and an **audio level** value for the orb, mic auto-open (`useAudioLevel`) | 6.5 h |
| Nice 13 | Upload PDF via UI | 2 h |
| Nice 16 | Pre-ingested book library | 1 h |

**Must total ≈ 10 h** (lightest in Must), so Lane C starts **Should items early** (STT and the teacher page) and **supports integration** at H8 and H14.
**Exposes:** `Repository` implementation, `src/sources` API, teacher pages, `SpeechPlayer`. **Consumes:** `contracts`.

## 5. Tier-by-lane map (nothing falls between the lanes)

| Scope item | Lane |
|---|---|
| Must 1 Board with live writing/drawing | A (render), B (script, drawing) |
| Must 2 Two-way text conversation + click-and-ask | A (UI), B (turn loop) |
| Must 3 Three-layer prompt + History profile | B |
| Must 4 Ingestion, retrieval by lesson, citations, outside-material | C (ingest, validator), B (use in turn) |
| Must 5 Source chips + PDF at the excerpt | A |
| Must 6 Evidence recording | B (judge), C (storage) |
| Must 7 Event log persisted | C |
| Should 8 Teacher screen | C |
| Should 9 Post-session analysis | C (job), B (structured SVG shares the Should slot) |
| Should 10 Voice | C |
| Nice 11–18 | per the lane tables |

## 6. Integration checkpoints

| Hour | Checkpoint | What gets connected | Who drives |
|---|---|---|---|
| 0–1.5 | **Kickoff** | Contracts, fixtures, skeleton | All |
| ~3 | Repo swap | B moves from in-memory stub to C's SQLite repository | C |
| **8** | **Integration 1** | A switches from fixtures to B's real `/turn`; end-to-end text turn with a real LLM | A + B |
| **14** | **Integration 2** | Citations (C validator ↔ B ↔ A chips) and evidence (B ↔ C ↔ teacher card) | B + C |
| **18** | **Cut line / Must demo** | Full Rome demo script run end to end by all three | All |
| 22 | **Feature freeze** | Only bug fixes after this | All |
| 22–24 | Rehearsal ×2, image pre-generation, fallback checks | | All |

If Must is not green at H18, **nobody starts Should**; everyone helps close Must.

## 7. Avoiding merge conflicts

**Ownership table**

| Path | Owner | Others may |
|---|---|---|
| `src/contracts/**` | Shared (frozen) | Additive PR only, with a message to the other two |
| `src/ui/**`, `public/brand/**` | Shared at kickoff, then Lane A | Additive PR; Lane C consumes them for the teacher UI |
| `assets/**` | Founder | Read only; never edit or import from code |
| `src/board/**`, `src/app/(student)/**` | A | Read only |
| `src/tutor/**`, `prompts/**` | B | Read only |
| `src/db/**`, `src/sources/**`, `src/analysis/**`, `src/voice/**`, `src/app/(teacher)/**` | C | Read only |
| `package.json` / lockfile | Shared | Small PRs; after a merge, others `git pull --rebase` and `npm install` |
| `.env.example` | Shared | Append only |
| `fixtures/` | A and B | Add **new files**; never edit another lane's fixture |
| DB migrations/schema | **C only** | Request changes to C (they are small) |
| `docs/` | Lane that changes the behavior | Update the relevant doc in the same PR |

**Git rules**

- Trunk-based with short branches: `feat/a-board-queue`, `feat/b-turn-handler`, `feat/c-ingest`. **No branch lives longer than ~3 hours.**
- Open small PRs into `main` often; run `git pull --rebase origin main` before opening.
- One owner per PR review: the owner of the path being changed; shared files need one other person's quick look.
- Never commit secrets, `.env`, PDFs or `.sqlite` files.
- Don't force-push `main`.
- If you need something from another lane, **write a one-line request** in the team chat with the exact interface you expect; keep working against the stub meanwhile.

**Why these seams are safe**

- A never imports from `src/tutor` or `src/db`; it only calls HTTP endpoints and uses `contracts`.
- B never imports UI code; it imports `contracts` and the `Repository` interface (stub first, real later).
- C implements the `Repository` and owns the schema; changes to the interface go through the additive-PR rule.

## 8. Working with AI agents in parallel

- Start each session with *"Study the repository"*, then tell the agent: *"I am Lane X; only edit these paths: …"*.
- Ask agents to run `npm run typecheck` and the fixture tests before opening a PR.
- Do not let two agents edit `src/contracts/**` at the same time.

## 9. Definition of done

**Lane A Must:** fixture scripts play correctly (write, highlight, circle, draw placeholder → image, timeline); interruption works; click-and-ask sends `board_select`; chips open the PDF at the highlighted quote.
**Lane B Must:** `turn-cli` with the Rome lesson returns valid scripts for the happy path, a wrong answer and an out-of-material question; images are cached; evidence is recorded.
**Lane C Must:** ingest script produces chunks for the Rome PDFs; citation validator rejects fake quotes; sessions and events persist and reload; seed script runs on a clean checkout.
**Demo ready (H18):** the 7-step script in `01-hackathon-scope.md` runs live, twice in a row, from a clean start.

## 10. When a lane is blocked or finished early

| Lane | Pull next from |
|---|---|
| A | Nice 12 "My progress", Nice 15 resume, polish of animations, mobile/laptop layout, accessibility basics |
| B | Structured SVG, prompt regression suite, Nice 11 Math profile |
| C | Should voice, Nice 13 upload, help A with the PDF viewer or B with the judge |

Anyone who finishes early **reviews and tests another lane's output** against the fixtures before starting a new feature.
