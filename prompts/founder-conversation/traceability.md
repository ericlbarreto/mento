# Traceability — what each prompt asked and where it landed

> Prompt ids refer to `prompts-verbatim.md`. "Where" lists the repository files that implement or record the answer. Times are UTC. Last updated: 2026-10-30.

## Main session

| Id | Time | What the founder asked | Outcome / where it landed |
|---|---|---|---|
| P01 | 13:24 | Study the Mento brief; brainstorm which features to prioritize for a 2-day hackathon (whiteboard + voice tutor for the student; teacher side with proactive view of student cognition; ZDR-style AI) | Scope proposal; ZDR vs memory explanation; cognition-modeling options. → `docs/00`, `01`, `05`, `08`; brief copied to `docs/reference/` |
| P02 | 13:31 | Team of 3 (split later); show in the demo that all school materials are uploaded and used; plan to show sources from the student side even without a teacher UI; ingest PDFs/books | Ingestion plan (folders + script), citations/highlight, future ideas parked (exams, class transcription). → `docs/04`, `01` |
| P03 | 13:33 | Make the API usable by both a realtime agent (STT/TTS) and a chat, with a toggle | One tutor brain, channels as adapters; event contract. → `docs/07`, `16` |
| P04 | 13:36 | How speech-to-speech works; providers (ElevenLabs, Deepgram, Twilio); low budget; research whiteboard tech, avoid building from scratch (Excalidraw?); drawings like a Colosseum | Voice cost table; tldraw candidate (later superseded); drawing options. → `docs/11` |
| P05 | 13:39 | Lock the scope: must-haves (AI whiteboard that writes, two-way conversation, grounded in materials, Roma Antiga example); how to parse documents and highlight sources; whether to build a teacher UI in ~24 h | Must/Should/Nice/Out proposal, demo script, parsing decision. → `docs/01`, `04` |
| P06 | 16:44 | Put the teacher page ("set" = 7) ahead of voice in Should | Reordered tiers. → `docs/01` |
| P07 | 16:47 | Teacher page basics: materials per discipline + proactive view of how each student reasons/studies best, shown with a metric | Teacher card design, analysis, ZDR note. → `docs/05`, `06` |
| P08 | 16:49 | The AI must know how to teach every subject (prompt); match discipline ↔ PDF; give the final Must/Nice list | Subject profiles, 3-layer prompt, explicit linkage. → `docs/03`, `04`, `01` |
| P09 | 16:51 | Model disciplines in the backend now; teacher UI only displays; no over-engineering; keep prompt freedom | 9-table model, prompts as files. → `docs/07`, `03` |
| P10 | 16:53 | Create the repository context structure (AGENTS.md etc.), describe Mento as much as possible, usable from another computer ("Study the repository") | `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/00–14`, `materials/`, `prompts/` |
| P11 | 16:55 | Documentation in English; the platform in Portuguese | Language policy; all docs rewritten in English. → `AGENTS.md` |
| P12 | 17:02 | Quick (token-conscious) deep research: whiteboard + speech-to-speech providers, natural/fast/cheap; look at Studdy and Flint | Providers, tldraw, Studdy/Flint notes. → `docs/11` |
| P13 | 17:05 | (2 screenshots) No SVG library; the whiteboard must draw; Studdy does; cascade vs speech-to-speech? | Studdy image analysis; recommendation. → `docs/11`, `15` |
| P14 | 17:09 | Does speech-to-speech make sense? Inspect the Studdy landing; can it call tools/RAG? | Landing inspection; tool-calling confirmed for realtime APIs. → `docs/11` |
| P15 | 17:09 | Use my Chrome with Studdy open: network, console, upload a file, use the whiteboard to find the tech | Live exploration. → `docs/15` |
| P16 | 17:14 | How does Studdy draw, place images, generate images? | Explanation: script of tool calls, `draw` pipelines. → `docs/15` |
| P17 | 17:15 | Is that simple to build? What did you observe? Viable for an MVP? | Feasibility assessment and hour estimates. → `docs/16` |
| P18 | 17:16 | How do they do the images? | Image-model pipeline explanation. → `docs/15` |
| P19 | 17:17 | Do the detailed analysis (including structured diagrams), build the technical roadmap along the way; follow our own product, not a copy | Second Studdy session. → `docs/15` |
| P20 | 17:26 | Build the full technical roadmap with all Studdy findings | `docs/16-technical-roadmap.md`; decisions D18–D23. → `docs/10` |
| P21 | 17:29 | Which language and frameworks (TypeScript or Python) for back and front | TypeScript + Next + SQLite (D24). → `docs/10`, `17` |
| P22 | 17:31 | Leave everything documented; start dividing activities among 3 people, independent, following Must/Nice | `docs/17-work-split.md` (lanes, contracts, checkpoints) |
| P23 | 17:35 | Quick research of UI references: Studdy-like voice start with a center-bottom orb + mascot + wave; Flint for the teacher UI; both UIs similar | `docs/18-ui-references.md` |
| P24 | 17:40 | Mascot not needed yet; founder will do it elsewhere | Placeholder kept; Q11 open then resolved by P25–P26 |
| P25 | 18:58 | A logos folder exists; include it in the plans | Assets reviewed; `docs/19`, `assets/README.md`, D27 |
| P26 | 18:59 | (image) The logo will be this one, also saved as logo.png | `assets/brand/logo.png` = logo-05; D27 |
| P27 | 19:11 | Yes, generate the logo symbol | `assets/brand/logo-symbol*.png`, `favicon-32.png`, `apple-touch-icon.png` |
| P28 | 19:15 | Is everything documented (technical, product)? | Audit; fixes; glossary, privacy, market, evidence flow, `docs/20` runbook |
| P29 | 19:16 | (mid-turn) Did you already research TTS? Explain | Honest account of the first TTS search |
| P30 | 19:18 | Yes, research TTS | TTS research section. → `docs/11` |
| P31 | 19:21 | Azure isn't bad? I want the most natural Portuguese voice with low latency; which do you recommend? | Default switched to ElevenLabs Flash v2.5; listening test; D20, D40. → `docs/11`, `10` |
| P32 | 19:26 | Add that to the technical docs; push all documentation to the GitHub repo (commands pasted) | Repo URL in docs; commit `62ea9f4` pushed |
| P33 | 19:28 | Plan the repository structure as a monorepo, per the stack choices | `docs/21-repo-structure.md`; D28 |
| P34 | 20:18 | Did you only plan, or create folders/install libs? | Answer: only the plan; nothing created |
| P35 | 20:21 | Does the API live inside web? Explain | Answer + later superseded by P39 (D43) |
| P36 | 20:26 | Product update: teacher interface simplified (Students + Materials tabs, single teacher, no auth); whiteboard data → insights; class context (7º–9º ano); update all docs in English | Docs 00–08, 12–13, 16–18, 20–21 updated; D29–D36; Q12–Q16; commit `7dc2c51` after P37 |
| P37 | 20:34 | Yes, commit and push | Commit `7dc2c51` pushed |
| P38 | 20:34 | Split among 3 people with a folder/file; teacher interface + insights from whiteboard conversations; front/back details (element identification, circling, fluid UX, answering; STT/TTS storage, API calls, low-latency orchestration, delivering data to the teacher side); "I will pay for everything"; beige + Mento-blue interface with logos, icon and mascot GIFs; use the `impeccable` skill | `workstreams/` (5 files); `docs/18` §6; D37–D42; Q17–Q19 |
| P39 | 20:40 | Don't use the Next API; use a robust, scalable backend (Nest/Express/…) for real-time and to connect with "Yash" | `docs/21` rewritten (Fastify `apps/api`); D43–D44; Q20–Q21 |
| P40 | 20:42 | (mid-turn) Why agree on schemas between front and back? Can't we develop independently? | Explanation + section in `workstreams/README.md` |
| P41 | 20:44 | Consolidate: include in the prompts folder all the prompts I sent, from the whole conversation | This folder |

## Forked session ("Mento hackathon feature prioritization (fork)")

| Id | Time | What was asked | Outcome |
|---|---|---|---|
| F01 | 20:35 | (file `Hackathon Desafios.pdf`) Does our idea make sense for challenge 3 of the hackathon brief? | Answered in the fork session; **not reflected in the docs yet**; the PDF is not in the repo |
| F02 | 20:37 | How can the solution improve the professional's (teacher's) gain? | Answered in the fork session (read as the teacher's gain); **not reflected in the docs yet** |

## Reading the arc

1. **P01–P09:** scope and product shape (whiteboard + materials + teacher insights), tiering, tutor prompts.
2. **P10–P11:** repository context files and the language policy.
3. **P12–P21:** technical research (voice, whiteboard, Studdy teardown), roadmap, stack.
4. **P22–P27:** work split, UI references, brand assets.
5. **P28–P35:** audit, TTS decision, GitHub, monorepo, clarifications.
6. **P36–P41:** simplified product model, three-person split, separate API, schema rationale, prompt consolidation.
