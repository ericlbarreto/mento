# Plan v2: Stitch student pages wired to the real API (Person 2)

> Status: **reviewed, awaiting approval**. Nothing implemented yet. Author: Person 2 (Robério) + agent, 2026-10-30.
> Inputs: 7 student screens exported from Stitch (`~/Downloads/stitch_mento_ui_prompts/`, local only), `docs/frontend-integration.md` and `docs/frontend-rendering-guide.md` (on `origin/main`), draft decisions D62/D63 (uncommitted on `docs/session-lifecycle-v2`), Person 2 PRs #1, #2, #3, #4, #6 (open, unmerged).
> v2 folds in two independent reviews (backend fit; scope and execution). Changes from v1 are listed in §10.

## 0. Goal

Ship one **end-to-end student feature with final value**, against the **real API on `main`**:

1. The demo student is already set.
2. The student clicks a subject card (or the free Mento button).
3. The tutor opens the lesson on the whiteboard, with captions, citations and a chat.
4. The student answers by text, or by voice when the keys exist, and uses click-and-ask.
5. The student ends the lesson, and later resumes it from the history.

The fixture/mock mode stays as a fallback.

The user asked for every button drawn in Stitch to be rendered, even when the API has no feature for it. Those buttons are **inert**: visible, `aria-disabled="true"`, tooltip "Em breve". They are listed in §6 so the team can remove them or ask for the feature.

## 1. What the backend offers today (verified on `origin/main`, 2026-10-30)

**Every session route needs MongoDB** (`ensureConnected()`), including fixture mode. Without it, they answer 503 `database_unavailable`.

| Need | Endpoint | Status |
|---|---|---|
| Subject cards | `GET /api/subjects` → `ListSubjectsResponse` | Works |
| Start a lesson | `POST /api/sessions { student_id, modality, subject_id?, topic? }` | Works. `student_id` is any string. The server writes a `session_started` event at once |
| Opening turn + replies | `POST /api/sessions/:id/turn` (SSE of `StreamMessage`) | Works. Errors that happen **before** the stream starts (503 `tutor_unavailable`, 404, 400) arrive as plain JSON over HTTP, not as SSE |
| Same SSE without LLM | `GET /api/dev/fixture-turn?name=&speed=` | Works. `speed` multiplies delays (0 = instant). Fixture turns are **not stored** |
| End lesson | `POST /api/sessions/:id/end { reason }` | Works |
| Resume an ended lesson | new turn on an ended session | **Not on main yet.** Planned in draft D62 (`session_resumed`). Until it lands, "Continuar" on an ended session starts a new session on the same subject |
| History list | `GET /api/sessions?student_id=&subject_id=&limit=` | Works. Page size defaults to 20 (max 100), so counts cover the page only. We send `limit=100` |
| Reopen / replay | `GET /api/sessions/:id` → `{ session, events }` | Works. `Event.payload` is `unknown`. A `tutor_action` payload is `{ turn_id, action_id, order, name, args }` |
| Student speech | `POST /api/voice/token` + `useStt` (`@mento/voice/client`) | Works with a Deepgram key, otherwise 503 |
| Tutor speech | `GET /api/tts/:action_id` + `PcmPlayer` | **Unavailable today.** No ElevenLabs voice, so `speak` has no `audio_url`. Captions only |
| Images | `GET /api/gen/:file` | Works. URLs are relative, so they resolve against `NEXT_PUBLIC_API_URL` |
| Students list | `GET /api/students` | **404** (route file registers nothing). Mocked students come with Person 1 PR #7 |
| Open the cited PDF page | `GET /api/files/:id` | **404** (Person 1, not built) |
| Class label | class-context route | **404**. The tutor's class context is hard-coded to "8º ano" |
| CORS | `WEB_ORIGIN`, a single origin (default `:3000`) | Run one web server at a time, on :3000 |

**Contracts.**
- The turn and stream shapes in our `packages/board/src/protocol.ts` mirror **match** `@mento/contracts` on main, so they are swapped for imports.
- The start-screen shapes do **not** match:
  - Main has no `StudentSummary`.
  - Main's `MaterialSummary` has no `subject` field and no `queued` status.
  - `CreateSessionRequest` uses `subject_id` instead of `material_id` and has no `persona`.
  - `CreateSessionResponse` adds `subject_id`.
  - `SessionEndReason` is not exported; use `EndSessionRequest["reason"]`.
- Only `StudentSummary` and the mock students stay local, in `packages/board/src/mock`, until PR #7 merges. Everything else comes from contracts.

**Draft decisions this plan follows** (D62/D63, uncommitted on `docs/session-lifecycle-v2`, owned by Person 2):
- Ended sessions can be resumed, which makes resume a Must.
- The **5-minute client idle timer is removed**; the server ends a session after 60 min idle.
- The "Terminar conversa" button and the end request on tab close stay.

## 2. Screen → route → data map

| # | Stitch screen | Route / component | Data source |
|---|---|---|---|
| S1 | Início do aluno ("Oi, Maya!") | `/` | `GET /api/subjects`, `GET /api/sessions?student_id&limit=100` |
| S2 | Carregamento "Preparando sua aula…" | overlay in `/session/[id]` | from page load until the first `action` (or an error) |
| S3 | Sessão: lousa + conversa aberta | `/session/[id]` | turn SSE |
| S4 | Sessão: conversa fechada, lousa expandida | same page, panel collapsed | local UI state |
| S5 | Sessão: menu de opções | `⋮` in the session header | local state + `POST end` |
| S6 | Sessão pausada / encerrada | modal in the session | local state |
| S7 | Histórico de Aulas (drawer) | drawer in the session, also reachable from S1 | `GET /api/sessions?student_id&subject_id&limit=100` |

**Student identity (Must 8).**
- A pre-set demo student is used by default: the first mock student, id `"demo-ana"`.
- A small "Trocar aluno" link opens the existing picker from PR #3.
- The id is stored in `sessionStorage` and sent as `student_id`.
- The mock list stays until PR #7 merges, always with the "Dados simulados" badge.

## 3. Behaviour per screen

### S1 Home
- **Header (shared chrome):**
  - Logo.
  - Nav: "Estudos" active, linking to `/`; "Atividades", "Meu Progresso" and "Biblioteca" are inert.
  - Class chip **"8º ano"** only. Not "Turma 8B", which is invented.
  - Student name with an initials avatar. No photo, no "Online para estudar".
- **Eyebrow** "Companheiro de estudos com IA pedagógica" and hero "Oi, {nome}! Pronto para aprender no seu ritmo?" are kept.
- **Body copy** is rewritten so it does not promise what we do not do. It drops "resolva exercícios": "Tire dúvidas sobre o que a turma está estudando, com explicações na lousa e citações do material do professor."
- **Voice CTA** "Conversar com o Mento por voz" (tag "Conversa livre por voz") does `POST /api/sessions { modality: "voice", subject_id: null }`, then goes to `/session/:id`.
  - If `/api/voice/token` answers 503, the session continues in text mode and shows the notice "Voz indisponível agora, vamos por texto".
- **"Última sessão: {título} · {duração}" pill:** comes from the latest session; hidden when there is none. **"Dica: fale em voz alta"** chip: static.
- **Section "Cadernos de Estudo do 8º ano"** with its helper copy: one card per item in `subjects[]`.
  - Icon chosen by `key`: history = columns, math = ruler, generic = book.
  - Badge: "{material_count} livro(s)".
  - Body: the material titles.
  - CTA "Estudar com o Mento" does `POST /api/sessions { modality: "text", subject_id }`.
  - **No invented subject cards and no "Novo tema" badge.**
- **"Continuar de onde parou":** shows the latest session.
  - Title: `title ?? "Conversa sem título"`.
  - Subtitle: subject name, then "{turn_count} interações · {relative time}". The Stitch line "página 45, 2 exercícios pendentes" cannot be derived and is dropped.
  - Button "Continuar estudo" opens `/session/:id`.
- **Footer** (logo, "Ambiente de Aprendizado com Inteligência Pedagógica", "Caderno de Estudos · Ensino Fundamental II"): static on every page.
- **Errors:**
  - 503: banner "Não conseguimos falar com o servidor", with "Tentar de novo".
  - Empty subjects: card "Peça ao professor para enviar um material". The free Mento CTA still works.

### S2 Loading
- **Stages:**
  - Stage 1, "Abrindo a lousa": `GET /api/sessions/:id`.
  - Stage 2, "O tutor está preparando a aula": opening turn sent.
  - The bar is indeterminate. There is no fake percentage.
- **Kept:** mascot, "Tô quase!" bubble, the quote "Respira fundo, o aprendizado começa agora!", and the "Mento" wordmark.
- **Dropped:** "Caderno virtual ativo" and "Mento Educação" (decorative). The three Stitch cards ("Resumos prontos", "5 Questões ajustando", "Tutor IA conectado") make claims we cannot back, so they are replaced by the stage list.
- **After 8 s:** add "Está demorando mais que o normal…".
- **Errors:**
  - `!res.ok` before the stream: 503 `tutor_unavailable` shows "O tutor está indisponível agora", 404 shows "Conversa não encontrada" with a link home, and both offer "Tentar de novo".
  - SSE `error`: shows its `message`.
  - "Tentar de novo" resends the opening turn **only if no action was drawn yet**. Otherwise it focuses the chat input, so nothing is drawn twice.
- **Opening turn rules:**
  - The opening turn (`appended: []`) is sent **only if the session has zero `tutor_action` events**. `session_started` always exists, so "zero events" is the wrong test.
  - Guard it with a ref or in-flight flag so React StrictMode and remounts do not send it twice.
  - Wait about 0.8 s after `POST /sessions` before the first turn (pre-warm, per the rendering guide).

### S3/S4 Session

**Board.**
- PR #6 renderer, fed by `StreamMessage` from `@mento/contracts`.
- Images: `resolveImageUrl(url, NEXT_PUBLIC_API_URL)`, with `mix-blend-mode: multiply`.
- Every element has `data-element-id`.

**Caption bar.**
- Shows the current `speak.text`.
- Word highlight comes from `speech_alignment`. In text mode it follows the queue's speech clock.
- Source chips read "Livro · p.N"; clicking one is inert until `files` exists (§6).
- "Fora do material didático" chip when `outside_material`.
- When an `audio_url` fails (fixture mode returns 404), the speak falls back to the text clock.

**Chat panel "Conversa em tempo real".**
- Transcript:
  - Student lines from `user_message`, labelled "Por voz" or "Texto", with time.
  - Tutor lines from `speak` text, with source chips and time.
  - "Falando agora…" under the speak that is playing.
  - "Tutor anotando na lousa…" while non-speak actions play.
- The input sends `user_message { kind: "chat" }`. The chevron collapses the panel (S4).
- The hint under the input reads **"Clique na lousa para perguntar sobre um trecho ou digite sua dúvida"**. Stitch's "Pressione espaço para falar" implies push-to-talk, which is not specified, so it is replaced.

**Click-and-ask (Must 2, not cuttable).**
- Clicking a board element (or selecting text in it) adds a removable "Sobre: {trecho}" chip above the input.
- The next message is sent as `user_message { kind: "board_select", selected: { element_id, text } }`.

**ask_verification.**
- Shows an answer box on the board element, which sends `verification_answer`.
- After the script, the orb is in `waiting` while a question is open.

**Interruption (text).**
- Sending while the tutor speaks triggers the interruption: stop audio, abort the fetch, clear the queue and keep the board.
- The next turn carries `interrupted { turn_id, action_id, spoken_ms }`.
- If the interruption comes before `script_done`, use the **previous** turn's id.

**Orb (PR #4).**
- Sits centred under the caption.
- States follow the queue:
  - `thinking` from send to the first action.
  - `speaking` during `speak`.
  - After `script_done` **and** the last speak has ended: `waiting` if a question is open, otherwise `listening` (voice) or idle (text).
- Clicking it toggles the mic in voice mode, or focuses the input in text mode.

**Voice (only when a Deepgram key exists).**
- `useStt`: show the interim caption live, send the final caption as `kind: "speech"`.
- The mic is muted while the tutor speaks and unmuted after `script_done` + the last speak.
- `onSpeechStarted` triggers the interruption (barge-in).

**Bottom-left controls:** pause/resume the queue (local), mute tutor audio (local), CC toggle (hide/show the caption bar).

**Bottom-right controls:** the keyboard button opens or focuses the chat. The second mascot button is inert (§6).

**Header.**
- "← Voltar" goes to `/` without ending the session; the server's 60-min idle and the tab-close end cover it.
- Breadcrumb "{Matéria} · {título}".
- "Histórico de Aulas (n)" opens S7.
- "Material Didático" is inert.
- `⋮` opens S5.

**Ending (D63).**
- `useEndSession` drops the 5-min idle timer.
- Tab close sends `fetch(url, { method: "POST", keepalive: true, headers: { "content-type": "application/json" } })` with `reason: "beacon"`. A cross-origin `sendBeacon` with a JSON blob may be refused.
- A refresh also fires `pagehide`. Under D62 that is harmless, because the next turn reopens the session. Until D62 lands, a refresh ends the session, so the beacon is sent **only on `visibilitychange` to hidden with no navigation in progress**. That will be verified in the browser; if it cannot be made reliable, the tab-close end is dropped until D62.

### S5 Menu
- "Encerrar conversa atual" sends `POST end { reason: "manual" }` and opens S6 Encerrada. The modal text "foram salvas" is shown **only on HTTP 200**; on failure it shows "Não conseguimos encerrar, tente de novo".
- "Pausar aula" pauses the queue and the mic, and opens S6 Pausada.
- "Limpar anotações temporárias", "Ajustes de áudio e microfone" and "Relatar dúvida ou problema técnico" are inert (§6).

### S6 Paused / Ended modal
- Stats are computed locally, and each is hidden when unknown:
  - Tempo: from `started_at`.
  - Lousa: number of board elements, shown as "{n} itens".
  - Referência: the last cited page.
- **Pausada:** "Retomar conversa" resumes the queue.
- **Encerrada:** "Continuar depois" goes to `/`, and "Retomar agora" sends a new turn.
  - Under D62 this new turn reopens the same session.
  - Before D62 lands, it creates a new session on the same subject.

### S7 History drawer + reopen

**Drawer.**
- Header: "Histórico de Aulas de {Matéria}" (or "Histórico de Aulas") and its subtitle; close X.
- Search box: filters `title` on the client.
- Filters: Todas / Em andamento / Concluídas, with counts over the loaded page (up to 100).

**Cards.**
- Status chip: "Em andamento" when `ended_at == null` (the current session reads "Aula atual"), otherwise "Concluída".
- Title and date.
- Duration: `last_activity_at - started_at`, shown as "{m} min". It is not labelled "de áudio".
- "{turn_count} interações".
- **Dropped:** the per-card summary paragraph and the "4 anotações" count (no API field), the "Revisão" tag and the avatar stack.

**Card actions.**
- "Continuar aula agora" opens `/session/:id`. For an ended session it opens the session and resumes it under D62 (before D62: opens it, and the next message starts a new session).
- "Ver lousa da aula" opens `/session/:id`.
- "Ouvir resumo em áudio" is inert.

**Footer CTA:** "Iniciar nova conversa de {Matéria}" sends `POST /api/sessions`.

**Reopen (`/session/[id]` on load).**
1. Call `GET /api/sessions/:id`.
2. Take the `tutor_action` events in **event order** (not by `order`, which restarts every turn).
3. Build `{ id: action_id, name, args }` from each and validate it with `Action.safeParse`, skipping invalid ones.
4. Apply them with no animation or audio.
5. Rebuild the transcript:
   - Student lines from `user_message.payload.text` and `verification_answered.payload.answer`.
   - Tutor lines from `speak` args.
6. The open verification is the last `verification_asked` with no later `verification_answered`.
7. Remember the last `turn_id` for the next interruption.
8. Send the opening turn only if there were zero `tutor_action` events.

## 4. Modes and configuration

| Env | Default | Effect |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | API base URL |
| `NEXT_PUBLIC_MOCK_API=1` | off | Everything local, no server (the current fixture mode). Fallback for an offline demo |
| `NEXT_PUBLIC_TURN_SOURCE=fixture` | off | Real sessions and history, but turns come from `/api/dev/fixture-turn` (no LLM key needed). Fixture turns are not stored, so history shows 0 interactions. A replayed fixture reuses element ids, so the client clears the board before each fixture turn |

The server also has `DEMO_MODE=fixture`, which is unused today. Once Person 3 wires it, the client flag can go. Text is the default modality until TTS is configured.

## 5. Waves, tracks, branches

**Stack depth problem (from the review).**
- PRs #3, #4 and #6 are drafts on `feat/p2-wave1-base`, not on main; #6 alone is about 4.5k lines.
- Stacking three more levels makes every fix ripple four bases down.
- **Recommended:** before W3, the user merges #1 and #2 into main and retargets #3, #4 and #6 to main. The new tracks then stack at most one level, on an integration branch of #3 + #4 + #6.
- **If the user prefers not to merge yet,** the fallback is the deeper stack below, with the same tracks.

| Wave | Track | Screens | Branch | Base | Depends on | Est. |
|---|---|---|---|---|---|---|
| W0 | Sync | — | merge `origin/main` into the base. Conflicts: `pnpm-lock.yaml` (regenerate it) and `(student)/dev/ui/page.tsx` (#3, #4 and #6 all add gallery entries) | — | Q1 | 30 min |
| W3 | K: API + contracts | — | `feat/p2-api-contracts` | integration of #3 + #4 + #6 | W0 | 3 h |
| W3 | L: Stitch chrome | — | `feat/p2-stitch-chrome` | same | W0 | 1 h |
| W4 | N1: Session core | S2, S3, S4 | `feat/p2-session-core` | K + L | K, L | 5–6 h |
| W4 | M: Home | S1 | `feat/p2-student-home` | K + L | K, L | 2 h |
| W5 | O: History + resume | S7 | `feat/p2-history` | N1 | N1 | 3 h |
| W6 | N2: Session extras | S5, S6, voice | `feat/p2-session-extras` | O | O | 3–4 h |

**First end-to-end value** is at the end of W4 (K → L → N1 + M): the demo flow from S1 to a live lesson with chat, captions, click-and-ask and ending. Total is about 17–19 h. If time runs short, cut in this order:
1. The S6 stats.
2. The S7 search and filters.
3. The S2 stage polish.
4. The inert-button tooltips.

**Track contents.**
- **K:**
  - Delete `protocol.ts` and import from `@mento/contracts`.
  - Keep `StudentSummary` and the mock students local.
  - Delete `packages/board/fixtures/`; use `fixtures/turns/` from main.
  - Rewrite `apps/web/src/lib/api.ts`: subjects, sessions create / list / detail / end (keepalive), turn SSE with `!res.ok` handling, fixture-turn, a voice token passthrough.
  - Speech clock falls back to text when audio 404s.
  - Replay helper `replayEvents(events)` in `packages/board/src/replay/` (moved here from O so it is unit-tested early).
  - `useEndSession` without the idle timer.
- **L:** Nunito Sans in `tokens.css`. The reference render is the S4 screen "conversa fechada", the only one that renders Nunito Sans correctly. New components:
  - `TopBar` and `Footer` (shared chrome)
  - `Avatar`
  - `Drawer`
  - `Modal`
  - `Menu`
  - `LoadingOverlay`
  - `InertButton`

  Gallery entries go in a new file, `/dev/ui/stitch`, so the shared `/dev/ui/page.tsx` is not touched.

### Files per track (overlap check)

| Track | Files |
|---|---|
| K | `packages/board/src/**` (except renderers' visuals), `packages/board/fixtures/**` (deleted), `packages/board/package.json`, `apps/web/src/lib/api.ts`, `(student)/session/_components/useEndSession.ts`, tests |
| L | `packages/ui/src/tokens.css`, `packages/ui/src/components/{TopBar,Footer,Avatar,Drawer,Modal,Menu,LoadingOverlay,InertButton}.tsx`, `packages/ui/src/index.ts`, `(student)/dev/ui/stitch/page.tsx` |
| M | `(student)/page.tsx`, `(student)/_components/start/**`, `(student)/_components/home/**` |
| N1 | `(student)/session/[id]/{page,SessionBoard}.tsx`, `(student)/session/_components/{chat,caption,controls,loading}/**`, `packages/board/src/renderers/**` (click-and-ask hook, verification box) |
| O | `(student)/session/_components/history/**`, one mount line in `SessionBoard.tsx` (stacked on N1, so there is no parallel conflict) |
| N2 | `(student)/session/_components/{menu,pause,voice}/**`, mount lines in `SessionBoard.tsx` (stacked on O) |

- **Parallel pairs:** K ∥ L share no files, and M ∥ N1 share no files.
- **Lane check:** every file is in a Person 2 path. Nothing goes in `packages/contracts`, `packages/voice`, `apps/api`, `(teacher)/**`, `app/layout.tsx`, `globals.css` or `dev/conversation`.

## 6. Inert buttons (rendered, not wired) and dropped content

| Screen | Element | Why | Suggestion |
|---|---|---|---|
| all | Nav "Atividades", "Meu Progresso", "Biblioteca" | No feature; out of scope | Remove |
| S3 | "Material Didático" button (and its dot) | `GET /api/files/:id` returns 404 (Person 1) | Wire with P2 T9 once `files` lands. **Must 5 gap: ask Person 1 for a date** |
| S3 | Source chip click (open the PDF page) | Same | Same |
| S3 | Second mascot button, bottom-right | No defined purpose | Remove |
| S5 | Limpar anotações temporárias | No endpoint; clearing only locally diverges from the stored events | Remove |
| S5 | Ajustes de áudio e microfone | No device picker | Remove for the hackathon |
| S5 | Relatar dúvida ou problema técnico | No endpoint | Remove |
| S7 | Ouvir resumo em áudio | No summary or TTS | Remove |

Content dropped because it would be invented (AGENTS.md rules 3 and 4):
- "Turma 8B"
- photo avatar, "Online para estudar"
- subject cards not returned by the API, "Novo tema"
- "página 45 / 2 exercícios pendentes"
- the S2 progress percentage and claim cards
- the S7 summaries, "anotações" counts and "min de áudio"
- "resolva exercícios"

## 7. Validation per track

- `pnpm typecheck`, `pnpm lint` and `pnpm test` in each worktree.
- **Environment:** one web server at a time on :3000 (CORS allows a single origin); API on :4000 with MongoDB.
- **K:**
  - SSE parsing against main's `StreamMessage`, including the `!res.ok` path.
  - The queue fed with `fixtures/turns/*.json`.
  - Text fallback when audio returns 404.
  - `replayEvents` against a recorded `SessionDetailResponse`.
  - The api client with a mocked `fetch`.
- **N1:**
  - The opening turn is sent once under StrictMode.
  - Click-and-ask sends `board_select`.
  - Interruption sends `interrupted`.
  - A verification answer sends `verification_answer`.
  - Run in three modes: real LLM, `TURN_SOURCE=fixture`, `MOCK_API=1`.
- **O:**
  - Reopening a real session redraws the board with no tutor speech and no new opening turn.
  - The history count matches the API.
- **N2:**
  - End shows the modal only on 200.
  - The tab-close behaviour is tested in Chrome: refresh vs close.
- **Visual:** browser check of each screen against its Stitch PNG, plus a keyboard and reduced-motion pass.
- **Reviews:**
  - `ui-reviewer` on M, N1, O and N2.
  - `security-reviewer` on K (rendering LLM output, image origins) and N1 (chat input → turn).

## 8. Questions (one round, with defaults)

1. **Flatten the stack:** will you merge #1 and #2 into main (and retarget #3, #4 and #6) before W3? Default: yes. If not, I use the deep stack and push the sync merges (plain, no force).
2. **D62/D63:** are they confirmed? The plan follows them (resume after end, no 5-min idle). Default: yes. Backend support for resume is still to be built, by whom and when?
3. **Demo student pre-set** (Ana, id `demo-ana`), with the picker behind "Trocar aluno". Default: yes.
4. **Subject replaces material** on the start screen, which closes Q16 / D50. Default: yes.
5. **Default modality is text** until TTS is configured; the voice CTA tries STT and falls back. Default: yes.
6. **Inert buttons:** keep them all rendered as asked, or remove the ones marked "Remove" in §6 now? Default: keep rendered, as you asked.
7. **Must 5 (source → PDF page)** depends on Person 1's `files` route. Default: I ask Person 1 for a date and log it as a known gap.

## 9. Not in this plan

- The teacher screens (5 Stitch screens, Person 1 lane).
- Wave-3/4 tasks not listed here: the full PDF viewer (T9) and annotation polish (T5) beyond what the PR #6 renderers already do.
- Backend work: D62 resume, `DEMO_MODE`, students/files/class-context routes.

## 10. Changes from v1 (review findings)

**Backend-fit review:**
- The opening turn is now gated on zero `tutor_action` events, not zero events.
- The beacon is replaced by `keepalive` fetch, and refresh handling is defined.
- Replay is rebuilt from the stored payload and applied in event order.
- Start-screen contract differences are spelled out.
- MongoDB is required everywhere.
- Fixture-mode caveats added: audio 404, reused ids, not stored.
- Errors that arrive before the stream are handled.
- StrictMode double-send guard and pre-warm added.
- Mic and orb timing corrected; voice barge-in added; `turn_id` fallback on interruption added.
- CORS limits the web server to one port.
- Class chip reduced to "8º ano".
- History `limit=100`.

**Scope review:**
- D62/D63 are followed: resume replaces read-only, and the idle timer is removed.
- Click-and-ask is not cuttable.
- The Must 5 gap is flagged.
- Every visible element is mapped, either to a track, to static copy or to the dropped list.
- Invented-data items are removed.
- The success copy depends on a 200.
- The stack is flattened, or explicitly deep.
- Package fixtures are deleted in favour of `fixtures/turns`.
- N is split into N1/N2 and re-estimated (about 17–19 h total).
- The demo student is pre-set.
- The gallery uses a separate file.
- The font reference screen is named.
