# Consolidated requirements (merged from all founder prompts)

> Built from `prompts-verbatim.md` (P01–P41, F01–F02). Prompt ids in brackets show where each requirement comes from. Status = where it is documented today. Last updated: 2026-10-30.
> If a later prompt **changes** an earlier one, the later one wins; both are shown.

## 1. Context and goal

- **Hackathon of 2 days**, backed by Teachy; ~24 h of build then code freeze; the goal is something **very good that works well**, demoed live [P01, P05, P12].
- **Team of 3 people**, working in parallel on one repository; work must be **independent with minimal conflicts** [P02, P22, P38].
- **Mento** is the project name; the repository must hold all context so any AI agent on another computer can be told "Study the repository" or "Read file X" and explain everything [P10]. → `AGENTS.md`, `CLAUDE.md`, `docs/`.
- **Budget:** at first low (cheap, lots of testing) [P04, P12]; later **"I will pay for everything"** [P38] → cost no longer decides, quality and latency do; still log cost. → `docs/10` D40.

## 2. Product

- **Two main interfaces:** the **whiteboard** (student) and the **teacher interface** [P01, P36].
- **Whiteboard:** an AI tutor that **really writes/draws on screen**, has a **two-way discussion** with the student, **fed by the teacher's materials** (e.g., Ancient Rome), citing sources [P05, P02]. Must "draw things" (e.g., a Colosseum), human-like, not only boxes [P04, P13]. Must be **natural, fast, and able to consult** the materials [P12].
- **Student can point at a board element and ask about it; the tutor can circle it; the experience must feel fluid; how the tutor responds** [P38].
- **Sources visible to the student** (which materials/pages were used) [P02, P05].
- **Voice:** speech-to-speech/voice tutor, natural, low latency, best Portuguese voice [P01, P04, P12, P31]; text chat as a toggle on the same backend [P03].
- **Teacher interface (simplified, final model [P36]):**
  - **Single teacher, no authentication** (quick win); opening three tabs shows the same data.
  - **Two entities/tabs:** **Students** (create in the UI or directly in the DB) and **Materials** (upload a PDF, e.g., a book).
  - **Students list:** overview metrics — **students, conversations, gaps generated, "sites" generated** (read as *insights*, see §8).
  - **Per student:** how the student is **evolving**, **gaps**, and **proactive suggestions**; the teacher sees "how this person thinks", ideally with a ZDR-style privacy posture [P01, P07, P36].
  - **Class context (global):** the teacher describes the class (e.g., 8º ano; 3º ano; college) and it applies to **all chats on all whiteboards**; **focus: Ensino Fundamental 7º, 8º, 9º ano** [P36 note].
- **The whiteboard generates the data** (conversations stored → insights for the teacher) [P36].
- **Earlier ideas now parked:** a per-discipline teacher setup with lessons/grades/classes [P01, P07] was **simplified by P36**; "upload all materials per discipline" is now "upload materials (PDF books)" [P02].
- **Future (not now):** exam/question generation, in-class transcription ("Wispr Flow for teachers") [P02].

## 3. Scope and priorities (hackathon)

- Must: AI whiteboard that writes live + two-way conversation grounded in materials + visible sources [P05]; the teacher page and its student-reasoning view come **before voice** in the Should list [P06, P07]; list of Must/Nice/Out kept and approved step by step [P05–P08].
- **Do not over-engineer;** keep freedom to iterate on prompts [P09].
- **Teacher UI:** if not enough time, plan how to show sources from the student side and seed/DB for data [P02, P09]; later the teacher UI became a real two-tab scope [P36] with a **cut order** proposed by the assistant (`docs/01`).
- Demo subject: **History — Ancient Rome** [P04, P05]. → `docs/01-hackathon-scope.md`.

## 4. Tutor intelligence

- The AI must **know how to teach every subject** (math, history, …), differing by subject; the prompt must show that [P08] → layered prompt with **subject profiles** (`docs/03`).
- **Match** the chosen discipline/material to the right PDF and consult it [P08] → explicit linkage to the chosen material (`docs/04`).
- **Class context** shapes language and examples for the grade level [P36 note].
- **Backend modeling of disciplines**/materials now; teacher UI only displays [P09].
- Insights from conversations feed back to the next conversation (assistant's design; consistent with P01/P36) → `docs/05`.

## 5. Technology and architecture

| Topic | Founder's direction | Where |
|---|---|---|
| One API for **realtime voice and chat** with a toggle | [P03] | `docs/07`, `docs/16` |
| Speech-to-speech vs STT+LLM+TTS; RAG/DB/PDF lookups through tool calls | [P04, P13, P14] | `docs/11`, `docs/16` (cascade chosen; tool calls) |
| Voice providers (knows ElevenLabs; asked about Deepgram/Twilio/Telnyx), cost-effective, **low latency, most natural Portuguese** | [P04, P12, P31] | `docs/11` (ElevenLabs Flash v2.5 default; Azure, Cartesia alternates) |
| Whiteboard: **don't build from scratch**, use something ready; study competitors (**Studdy**, Flint) | [P04, P12, P13] | `docs/15`, `docs/16` |
| Studdy teardown via the founder's logged-in Chrome (network, console, upload) | [P15, P19] | `docs/15` |
| Full **technical roadmap** from the findings, not copying Studdy but following the founder's product brainstorm | [P19, P20] | `docs/16` |
| Language/stack: TypeScript vs Python | [P21] | TypeScript; `docs/10` D24 |
| **Monorepo** structured per the tech choices | [P33] | `docs/21` |
| **Robust, scalable backend** instead of Next API (Nest/Express/other), real-time, connecting to "Yash" | [P39] | `docs/21` (Fastify `apps/api`), D43–D44 |
| **Why agree on schemas** between front and back | [P40] | `workstreams/README.md` |
| How to store/handle **STT and TTS**, call APIs, orchestrate with low latency, send data to the teacher side | [P38] | `workstreams/03-whiteboard-backend.md` |
| Rapid, **not-too-large research** (token-conscious) | [P12] | process rule |

## 6. UI and brand

- **Whiteboard test interface:** **light beige** with the **blue of the Mento logo**; use the **logos, the icon and the mascot GIFs** in the repository; **beautiful interface** with **animations using the mascot** [P38].
- **Start/voice experience:** an orb at the bottom center with the **mascot/logo**, waves around it (ChatGPT-like), similar to Studdy; the **teacher interface** referenced on Flint; **both UIs share a similar look** [P23].
- **Logos:** a folder of logos/mascot exists; the **chosen logo** is the wave "m" + "mento" [P25, P26]; generate the **symbol** [P27]; the **mascot** is defined by the founder elsewhere [P24].
- **Use the `impeccable` skill** for beautiful interfaces [P38] (not found in the assistant's catalogs; fallback `frontend-design`). → `docs/18` §6, `docs/19`, D41–D42, Q17.

## 7. Process and working rules

- **Documentation, code and everything in the repo in English; the platform/product in Portuguese** [P11]. → `AGENTS.md`.
- **Document everything** (technical and product) and keep it consistent [P22, P28, P32, P36]; update docs when the product changes [P36].
- **Split work between three people:** Person 1 teacher interface (+ how insights are collected from the whiteboard conversation), Persons 2 and 3 front and back of the whiteboard [P38] → `workstreams/`.
- **Commit/push on request:** push the documentation to `github.com/ericlbarreto/mento` [P32, P37].
- **Ask for explanations when needed** and get honest answers about what was done vs planned [P28, P29, P34, P35].
- **Consolidate the founder's prompts into the repo** (this folder) [P41].
- Forked session: evaluate fit against **"Desafio 3"** of the hackathon brief and how the solution improves the **professional's (teacher's) gain** [F01, F02] — answered in the fork; **not yet reflected in the docs**; the PDF is not in the repo.

## 8. The assistant's interpretations (to confirm)

| Founder said | Interpreted as | Prompt | Tracked in |
|---|---|---|---|
| "sites gerados" | **insights** generated (speech-to-text slip) | P36 | `docs/10` Q13 |
| "8º ano do ensino médio" | **8º ano of Ensino Fundamental II** | P36 note | `docs/10` Q14 |
| "como responder estudos" | how the **student answers/asks and how the tutor's reply is presented** | P38 | `docs/10` Q18 |
| "conectar com o Yash" | **unknown** (external system, teammate's service, or a slip) | P39 | `docs/10` Q21 |
| "speed to speed" | speech-to-speech | P04, P14 | — |
| "Danix" | Deepgram | P04 | — |
| "Story" / "Studi" | Studdy (competitor whose whiteboard the founder likes) | P13, P23 | `docs/15` |
| "notarla" | "a nossa IA" | P08 | — |
| "set" (priority) | "sete", item 7 (the teacher page) | P06 | `docs/01` |
| "Márcio" | an address to the assistant (name slip) | P19 | — |
| "mento-logos" / "prompt" folders | `assets/brand-concepts/` and `prompts/` in the repo | P25, P41 | `assets/README.md`, this folder |
| "Vou pagar tudo" | the founder pays all services; cost is not the constraint | P38 | `docs/10` D40 |

## 9. Open items from the founder's prompts

- Confirm Q12–Q21 in `docs/10-decisions.md` (tiering, "sites", class context placement and "ensino médio" slip, student access, one material per conversation, `impeccable` source, "como responder", insights ownership, Fastify vs Nest, "Yash").
- Mascot details to be defined by the founder in another session [P24].
- Whether to bring `Hackathon Desafios.pdf` and the fork's answers into `docs/` [F01, F02].
