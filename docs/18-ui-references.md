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

### 3.1 Start screen (simple, lesson-based)

"O que vamos aprender hoje, {nome}?" → **subject cards** → **lesson list** (Roma Antiga) → short summary of the lesson's materials ("Material desta aula") → **Começar**. No free topic box (the teacher's materials are the lesson plan). Persona choice is optional (one default for the demo).

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
- "Material" button (top right) opens the lesson materials drawer.

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

## 4. Teacher interface (Flint-inspired, read-only for the hackathon)

### 4.1 Layout

```
┌───────────┬──────────────────────────────────────────────────────────────┐
│ [logo]    │  História · 8º ano                                            │
│ Mento     │  ┌ Insight ──────────────────────────────────────────────┐   │
│           │  │ 6 alunos confundem República e Império   [Ver evidências] [Criar atividade de reforço]│
│ ▣ Início  │  └────────────────────────────────────────────────────────┘   │
│ ▤ Disciplinas │  Alunos                           Dados simulados ⓘ      │
│ ◎ Alunos  │  ┌────────────────────────────────────────────────────────┐   │
│ ▥ Materiais│ │ ● Maya P.   Concluiu   Conceitos: ▮▮▯  Equívoco: 1     │   │
│           │  │ ● Jordan L. Trabalhando  ...                           │   │
│           │  └────────────────────────────────────────────────────────┘   │
│           │  Cartão do aluno → Conceitos · Possíveis equívocos (com        │
│           │  trecho) · O que parece funcionar (n) · Próxima ação           │
└───────────┴──────────────────────────────────────────────────────────────┘
```

### 4.2 Patterns to borrow from Flint

| Flint pattern (marketing visuals) | Mento version |
|---|---|
| Left sidebar with class list and Home/Analytics | Sidebar: Início, Disciplinas, Alunos, Materiais |
| Sessions table with **LIVE** badge and status chips | "Sessões" table; for the demo the real student's session updates from the event log (Nice) |
| **Alert card** ("Jordan needs help with light reactions") | Insight card from the analysis: "possível equívoco" with the quote |
| **"Create follow-up activity"** CTA | "Criar atividade de reforço" button that only **registers the approval** in the hackathon |
| Numbered citations with excerpt and source | Same source chip and drawer used on the student side |
| Feature cards (icon + title + line) | Empty states and "Materiais" cards per subject |
| Examples of student reasoning in insights | The quote/excerpt from the student's answer in each misconception |

### 4.3 Student card contents (from `06-teacher-interface.md`)

Concepts (color by mastery, with confidence) · Possible misconceptions (hypothesis + quote + link to the session moment) · What seems to work (with `n`) · Suggested next action. Always with "Baseado em N sessões" and uncertainty labels; **no rankings, no permanent labels**.

### 4.4 Teacher UI rules

- Read-only; the only "action" is registering an approval.
- Simulated data always badged.
- A teacher can open a student's session as a **read-only board replay** (Nice 14).
- Khanmigo-style grouping by task (Plan / Create / Support) is **not** needed now; keep navigation to four items.

## 5. Components to build once (shared, `src/ui/`)

`Button`, `Card`, `Chip` (variants: source, status, badge, tag), `Avatar/Mascot`, `Orb`, `CaptionLine`, `Drawer` (PDF/material), `Table`, `InsightCard`, `EmptyState`, theme tokens (CSS variables). Use **Tailwind + shadcn/ui (Radix)** for the base primitives; charts, if any, as simple SVG/CSS bars (no heavy chart library).

## 6. Who builds what

| Piece | Lane |
|---|---|
| Tokens + base components (`src/ui/**`) | **Kickoff (all three)**, then Lane A owns; others add via PR |
| Orb (mascot + ring), student screens, captions | A |
| Teacher layout, tables, cards, insight card | C (uses `src/ui/**`) |
| Mic/TTS amplitude values for the orb | C exposes `useAudioLevel()` (mic) and a TTS level in `SpeechPlayer`; A consumes (stub: caption progress) |
| Mascot/logo assets | Founder (files in `assets/`); Lane A copies them into `public/brand/` at kickoff (K9) |

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
