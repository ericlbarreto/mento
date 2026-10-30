# Starter prompt — Person 3 (Whiteboard back-end (tutor, STT/TTS, orchestration))

> Paste this as the **first message** of your agent session. You can talk to the agent in Portuguese afterwards.

```text
Study the repository (read AGENTS.md first). I am Person 3: Whiteboard back-end (tutor, STT/TTS, orchestration).
Read workstreams/README.md, workstreams/03-whiteboard-backend.md, workstreams/contracts-spec.md and
workstreams/handoffs-and-insights-pipeline.md, plus the docs listed in prompts/sessions/03-whiteboard-backend/README.md.
Edit only my paths (workstreams/README.md, "Path ownership"). Do not rename any field defined in
contracts-spec.md.

Before writing code, reply with: (1) a summary of my scope, (2) the contracts I must not break,
(3) my day-0 checks and my first three tasks with estimates, (4) what I need from the other two people
and the mock I will use until it exists, (5) any doubt about the docs.

Then start with: day-0 checks (LLM tool-call speed and reliability; image-model bake-off; TTS bake-off with the 4 pt-BR lines; Deepgram token + WebSocket), then T2 (`turn-cli` + fixture recorder + `/api/dev/fixture-turn`) so Person 2 can build against fixtures by hour ~3.

Follow `contracts-spec.md` exactly: event names (§3), evidence `result` and `hints_used` (§5), hint signalling (§6) and the concept label rules (§7). The founder pays for all services, so choose models by quality and latency.
Log each meaningful prompt of this session in prompts/sessions/03-whiteboard-backend/ (see prompts/sessions/README.md).
```
