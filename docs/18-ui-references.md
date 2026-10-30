# 18 — UI references and shared design language

> Status: **proposal** based on a quick visual review (2026-10-30). Flint's teacher app is behind a login, so what we saw is its **public marketing visuals**, not the real product; Studdy's student app was explored directly (`15-studdy-teardown.md`). The **logo and mascot now exist** (`19-brand-assets.md`); colors below come from those files, fonts remain proposals.
> Goal: a **student interface** (voice-first tutor with an orb) and a **teacher interface** (Flint-like) that clearly look like **one product**.

## 1. What we reviewed

| Source | What it gives us | Confidence |
|---|---|---|
| **Studdy** student session (explored live) | Full-screen cream board; handwriting text; tutor avatar bottom-left, pause/volume, captions at the bottom, keyboard + mic bottom-right; pastel gradient home with three mode cards | Observed |
| **Flint** teacher visuals ([flintk12.com/teachers](https://flintk12.com/teachers)) | Warm cream background, serif headlines, orange accent + plum panels, pill chips, soft-shadow cards, a knight-helmet mascot, 3-pane builder (left nav + chat + live preview), **Sessions LIVE** table, alert cards, "Create follow-up activity" CTA, numbered citations | Marketing visuals only |
| **ChatGPT/Gemini-style voice mode** | Central orb that changes with idle / listening / thinking / speaking | From general knowledge (not re-verified) |
| **ElevenLabs UI** ([ui.elevenlabs.io](https://ui.elevenlabs.io/docs/components/orb)) | Open-source (MIT) React components on shadcn/ui: **Orb** (Three.js, states idle/listening/talking, audio reactivity), Bar Visualizer, Live Waveform, Conversation Bar, Mic Selector, Message, Response | Seen in docs |
| **Khanmigo for Teachers** (docs/guides) | Teacher navigation by task: Tools / Classes / Students / Resources; tool cards grouped as Plan / Create / Differentiate / Support / Learn | Secondary sources |
| LearnLens (research, teacher dashboard) | Sample response viewer, word clouds, bar charts, AI insights | Paper only |

## 2. Shared design language (the "connection" between both UIs)

One set of tokens and components used by both interfaces. Frozen at kickoff, additive afterwards (`17-work-split.md`, K9).

| Element | Proposal | Reference |
|---|---|---|
| Background | App `#F7F9FF`; **board paper** warm `#FFFBF2`; subtle pastel gradient only on start/home screens | Flint cream + Studdy pastel |
| Ink / text | **Mento navy `#162250`** (logo wordmark) | `19-brand-assets.md` |
| Brand primary | **Mento blue `#1E59ED`** (from the logo) for the orb ring, buttons and active states | `19-brand-assets.md` |
| Accent | **Orange `#FC724A`** (mascot spark marks), small highlights and alerts only | Flint orange, mascot sheet |
| Chips | Pill chips: **source chip** `Slides · p.12`, **status chip** (Trabalhando / Concluiu), **"Dados simulados"** badge, **"Fora do material"** tag | Flint status chips, numbered citations |
| Cards | Rounded 16–20 px, soft shadow, generous padding | Flint, Studdy |
| Headings | Same rounded geometric sans as the UI (the wordmark is rounded sans); no serif | Logo wordmark |
| UI text | Rounded friendly sans (proposal: **Nunito**) | Logo wordmark |
| Board text | Handwriting font (Caveat/Kalam); **verify pt-BR accents on day 0** | Studdy |
| Icons | One set (e.g., lucide) | |
| Mascot | The **Mento mascot** (round blue character) on the orb, empty states and as a small avatar; **logo** in headers | `19-brand-assets.md` |
| Motion | Calm and short (150–250 ms); orb is the only continuously moving element | |
| Language | All UI copy in pt-BR | |

**What connects the two interfaces concretely**
- Same **source chip** and same **mascot** everywhere.
- The teacher's student card uses the same **concept names and colors** as the board.
- The teacher's session viewer reuses the student **Board component in read-only mode** (replay from the event log; Nice 14).
- Same **"Dados simulados"** badge wherever simulated data appears.

## 3. Student interface

### 3.1 Start screen (simple: name → material → topic)

1. **"Quem é você?"**: the student picks their name from the teacher's list (no password in the prototype).
2. **"O que vamos estudar?"**: a card per **material** (title, subject, pages; only `ready` materials) and an optional **topic** field ("Ex.: República e Império").
3. **Começar**.

No subjects or lessons: the teacher's materials are the knowledge base. Persona choice is optional (one default for the demo).

### 3.2 Tutor session layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ☰ Roma Antiga                                    📄 Material   ⋯          │
│                                                                          │
│   [ BOARD: columns of handwritten text, timelines, images, annotations ] │
│                                                                          │
│                                                                          │
│              «Repare nessa data: 27 a.C.»   (captions, word highlight)  │
│                      [Slides · p.12]  [Fora do material]                 │
│                                                                          │
│ ⏸  🔊  CC                 ((( (  M  ) )))                  ⌨   🎙       │
│                           orb + mascot                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Orb at bottom center** with the **Mento mascot/logo inside** and an animated ring/wave around it (the ChatGPT-style feel you described).
- Left: pause, volume, captions toggle. Right: keyboard toggle (opens a text input above the orb) and mic button.
- Captions sit above the orb, **word-highlighted** when the TTS provides word timestamps (Studdy does this).
- Source chips appear under the captions and on board elements; **click opens the PDF drawer** at the page.
- "Material" button (top right) opens the drawer with the chosen material (PDF viewer).

### 3.3 Orb states

| State | Trigger | Visual |
|---|---|---|
| **Idle** | Waiting | Slow "breathing" scale on the ring; mascot still |
| **Listening** | Mic open | Ring reacts to **mic amplitude** (Web Audio `AnalyserNode` on the mic stream); small "ouvindo" label |
| **Thinking** | Turn requested, no action yet | Rotating gradient arc / soft dots; label "pensando…" |
| **Speaking** | `speak` playing | Ring waveform driven by **TTS output amplitude**; if audio is not routed through Web Audio (or in text mode), drive it from the caption progress |
| **Waiting for answer** | After `ask_verification` | Soft pulse + mic auto-opens in voice mode |
| **Muted / paused** | User action | Dimmed ring, crossed mic icon |

**Implementation choice (to decide with Lane A):**
- **Option 1 (recommended): our own lightweight orb** (Canvas or SVG, no Three.js). The **mascot GIFs/PNG** are the face (state mapping in `19-brand-assets.md` §4) and a ring is drawn from an amplitude value 0..1. ~2 h, no heavy dependency.
- **Option 2: ElevenLabs UI `Orb`** (MIT, shadcn/ui registry, Three.js via `@react-three/fiber`). Gives states and audio reactivity out of the box but adds weight and a 3D dependency; sources disagree on the exact install command, so check the current docs. Good as a **visual reference** even if we do not install it.

### 3.4 Student UI rules

- Voice-first look, but **text input always one tap away** (fallback).
- Never block the board: the orb shows state, the board keeps working.
- Show **where an answer comes from** (chips) and when it is **outside the material**.
- Large touch targets and keyboard navigation for the orb controls; high-contrast captions.

## 4. Teacher interface (Flint-inspired; two tabs)

One teacher, one workspace, no login. Two sidebar items: **Alunos** and **Materiais** (`06-teacher-interface.md`).

### 4.1 Layout (Students tab)

```
┌───────────┬──────────────────────────────────────────────────────────────┐
│ [logo]    │  Alunos                                                      │
│           │  ┌────────┐ ┌──────────┐ ┌────────────┐ ┌──────────────┐    │
│ ▣ Alunos  │  │Alunos  │ │Conversas │ │Lacunas     │ │Insights      │    │
│ ▤ Materiais│ │   12   │ │   37     │ │identificadas│ │gerados  58   │    │
│           │  └────────┘ └──────────┘ │   9        │ └──────────────┘    │
│           │                           └────────────┘                     │
│           │  Turma: 8º ano · "Leitura mediana, gostam de jogos…" [Editar]│
│           │  ┌────────────────────────────────────────────────────────┐  │
│           │  │ Maya P.   3 conversas   1 lacuna aberta   Dados simulados│ │
│           │  │ Jordan L. 5 conversas   2 lacunas abertas              │  │
│           │  └────────────────────────────────────────────────────────┘  │
│           │  [+ Criar aluno]                                            │
└───────────┴──────────────────────────────────────────────────────────────┘
```

### 4.2 Patterns borrowed from Flint

| Flint pattern (marketing visuals) | Mento version |
|---|---|
| Left sidebar with class list and Home/Analytics | Sidebar with two items: Alunos, Materiais |
| Sessions table with **LIVE** badge and status chips | Student table; status chips (e.g., "nova lacuna") |
| **Alert card** ("Jordan needs help with light reactions") | Insight cards in the student detail: gap with the student's own words |
| **"Create follow-up activity"** CTA | **Suggestion** card with Accept / Dismiss (only registers the decision) |
| Numbered citations with excerpt and source | Same source chip and drawer used on the student side |
| Examples of student reasoning in insights | The quote/excerpt from the student's answer in each gap |

### 4.3 Student detail

Header (name, conversations, last activity) · **Evolução** (per concept, with `n`; "evidência insuficiente" is its own state) · **Lacunas** (concept, description, evidence, confidence) · **Sugestões** (accept/dismiss) · **Progresso** · **Conversas** (read-only replay is nice-to-have). Always with uncertainty labels; **no rankings, no permanent labels**.

### 4.4 Materials tab

Upload button (PDF), title and subject fields, status chips (*Na fila → Processando n/N → Pronto / Falhou*), list with page count and an "Abrir PDF" action.

### 4.5 Teacher UI rules

- The only "actions" are creating students, editing the class context, uploading materials and accepting/dismissing insights.
- Simulated data always badged **"Dados simulados"**.
- Keep navigation to two items.

## 5. Components to build once (shared, `packages/ui/`)

`Button`, `Card`, `Chip` (variants: source, status, badge, tag), `Avatar/Mascot`, `Orb`, `CaptionLine`, `Drawer` (PDF/material), `Table`, `InsightCard`, `EmptyState`, theme tokens (CSS variables). Use **Tailwind + shadcn/ui (Radix)** for the base primitives; charts, if any, as simple SVG/CSS bars (no heavy chart library).

## 6. Who builds what

| Piece | Lane |
|---|---|
| Tokens + base components (`packages/ui/**`) | **Kickoff (all three)**, then Lane A owns; others add via PR |
| Orb (mascot + ring), student screens, captions | A |
| Teacher layout, tables, cards, insight card | C (uses `packages/ui/**`) |
| Mic/TTS amplitude values for the orb | C exposes `useAudioLevel()` (mic) and a TTS level in `SpeechPlayer`; A consumes (stub: caption progress) |
| Mascot/logo assets | Founder (files in `assets/`); Lane A copies them into `apps/web/public/brand/` at kickoff (K9) |

## 7. Open questions

1. ~~Mascot/logo~~ **Resolved:** see `19-brand-assets.md` (logo chosen, mascot + 4 GIFs exist). Remaining: SVG/favicon exports.
2. Confirm sampled brand colors and the UI typeface (Nunito proposal) with the designer.
3. Orb: own lightweight version (recommended) vs ElevenLabs UI Orb.
4. Do we show persona choice (two tutors, like Studdy) or one default tutor?
5. Do we include the live "Sessões" table (Nice) or keep a static student list?

## Sources

- Studdy: https://studdyai.com/ (live exploration, see `15-studdy-teardown.md`)
- Flint teachers page: https://flintk12.com/teachers ; Flint school analytics help: https://help.flintk12.com/en/articles/15122879-school-analytics-in-flint
- ElevenLabs UI: https://ui.elevenlabs.io/docs/components/orb ; https://elevenlabs.io/blog/elevenlabs-ui ; https://github.com/elevenlabs/ui/wiki
- Khanmigo for Teachers: https://www.microsoft.com/en-us/education/blog/?p=6378
- LearnLens (teacher dashboard research): mentioned in a search summary only; the exact paper link was **not verified**
