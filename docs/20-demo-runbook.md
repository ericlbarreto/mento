# 20 — Demo runbook (preparation, script, fallbacks)

> Status: **proposed**; commands and variable names are **planned**, not final, because no code exists yet. Built from `01-hackathon-scope.md` (demo script), `16-technical-roadmap.md` and `17-work-split.md`. Last updated: 2026-10-30.

## 1. Goal

Run the 3–4 minute Ancient Rome demo **live, end to end, twice in a row from a clean start**, with a known fallback for every part that can fail.

## 2. Environment checklist (planned variables)

Keys live in `.env` (git-ignored; names go in `.env.example`). Planned:

| Variable | Used for |
|---|---|
| `LLM_API_KEY`, `LLM_MODEL_TUTOR`, `LLM_MODEL_ANALYSIS` | Tutor loop, judge, analysis |
| `IMAGE_API_KEY`, `IMAGE_MODEL` | `draw` artistic images |
| `STT_API_KEY` | Minting the short-lived Deepgram token (Should) |
| `TTS_API_KEY`, `TTS_VOICE` | Voice (Should) |
| `DATABASE_FILE` | SQLite path |
| `DEMO_MODE` (`live` \| `fixture`) | Switch the turn handler between the real LLM and fixture replay |
| `API_PORT`, `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL` | API port (default 4000), allowed web origin (CORS), and the API base URL used by the browser |

Machine: laptop with Node, stable network, headphones/speaker tested, **microphone permission granted** in the browser used for the demo, volume on, notifications off.

## 3. Preparation (before the demo)

| When | Task | Owner lane |
|---|---|---|
| Day 0 | Bake-offs: pt-BR handwriting font, image model, TTS, LLM tool reliability | A / B / C (`17` §3) |
| Before H12 | Choose the **history book PDF** (text-based, rights OK; a manageable size) | C |
| Before H15 | Ingest it (script or Materials tab) and check chunks, page numbers and the outline; set the **class context** ("8º ano", short description); create the demo students | C |
| Before H15 | **Pre-generate and review** 4–6 Rome images (Colosseum, aqueduct, legionary, Forum, map, ship); cache by prompt hash | B |
| Before H18 | Seed simulated students with the "Dados simulados" badge | C |
| Before H18 | Record **fixtures** for the demo script (happy path, click-and-ask, wrong answer, out-of-material question) | A + B |
| H22 | Freeze features; only bug fixes | All |
| H22–24 | Two full rehearsals; test fallbacks once each | All |

Planned run order on a clean checkout (names may change): install → seed → ingest → pregenerate images → start the API and the web app (`pnpm dev` starts both; API on 4000, web on 3000) → open student and teacher pages.

## 4. The script (what to say and show)

| Step | Show | Say (idea) | Success check |
|---|---|---|---|
| 1 | Student picks their name and the history book, types the topic "República e Império" | "O professor subiu o livro e descreveu a turma." | Material and topic accepted |
| 2 | Ask: "Como Roma passou de República a Império?" | "Pergunta de um aluno de verdade." | Tutor starts writing in ≤ ~3 s |
| 3 | Board fills step by step: title, timeline, Colosseum image, chips | "O tutor escreve e desenha ao vivo, sempre citando o material." | Chips visible, image replaces placeholder |
| 4 | Click a date, ask "por que essa data?" | "O aluno pergunta sobre um ponto específico do quadro." | Answer mentions that element |
| 5 | Click a chip | "De onde veio? Direto do slide do professor." | PDF opens at the highlighted quote |
| 6 | Verification question; answer wrong; tutor adapts | "Ele verifica com uma pergunta nova e muda a explicação." | Evidence recorded |
| 7 | Teacher **Alunos** tab: metrics (students, conversations, gaps, insights); open the student | "A IA identificou a lacuna a partir da conversa, com a fala do aluno como evidência, e sugere o próximo passo." | Gap + evidence + suggestion visible; other students badged "Dados simulados" |

Close with the one-liner: *"A escola define o que se aprende; a Mento ensina cada aluno e mostra ao professor como ele está aprendendo."*

## 5. Fallbacks (decide before the demo, test once)

| If this fails | Do this |
|---|---|
| Voice (mic, STT or TTS) | Switch to text; captions carry the tutor's speech |
| TTS slow or down | Show captions only; or use cached audio for scripted lines (optional) |
| Image generation slow | Placeholder + continue; pre-generated cache covers the demo prompts |
| LLM slow or errors | `DEMO_MODE=fixture` replays the recorded script through the same SSE path |
| PDF viewer or highlight fails | Open the page without highlight; show the chip text with the quote |
| Network down | Fixture mode + cached images; teacher page reads the local database |
| Browser crash | Reopen; the session resumes from the event log (nice) or restart the conversation |

## 6. Honesty rules for the pitch

- Say **"dados simulados"** wherever the teacher view shows simulated students; never present them as real evidence of learning gains.
- Say **"arquitetura compatível com ZDR"**, not "somos ZDR".
- Do not claim competitors lack a feature without testing their live product (`09`).
- No customers, revenue or pilots exist; do not imply otherwise.
- Check the hackathon's IP and code-publication rules before submitting (Q7).

## 7. During the demo

- One person drives, one watches logs (latency, errors), one keeps time and the fallback switch.
- Keep a second browser tab on the fixture-mode version.
- After the demo: note questions asked and any visible latency, then update `10-decisions.md` and the relevant docs.
