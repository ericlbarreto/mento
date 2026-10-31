# 16: Faster tutor model (Haiku 5.5, thinking off) and the ElevenLabs plan

## Prompt (verbatim, Portuguese)

> Você pode abrir um novo PR e aí você pode rodar o comparativo, mas eu preciso disso bem rápido. Eu preciso realmente, porra, testar logo. Toda a camada de whiteboard, incluindo orquestração, TTS e STT, já está funcionando. Me diga qual o plano da Eleven Labs que eu tenho que comprar.

## What was done

- Opened PR #8 (`feat/whiteboard-history`).
- Compared 5 settings on a real turn (LLM time only): Sonnet 5.5 default (first action 4.9–6.1 s), Sonnet `between_tools` (2.0–2.7 s), Sonnet `between_tools` + low (~1.9 s), **Haiku 5.5 thinking disabled (1.3–1.5 s, script 3.2–4.2 s)**, Haiku disabled + low (similar time, poorer script).
- Chosen: Haiku 5.5 with thinking disabled. `TUTOR_MODEL`, `TUTOR_THINKING`, `TUTOR_EFFORT` are configurable; the same settings go to the pre-warm and every call (prompt cache).
- `pnpm turn:bench 3` end to end (with retrieval): first action p50 1664 ms, p95 2298 ms; script done p50 3842 ms; 0 errors (was ~4–5 s first action with Sonnet defaults).
- ElevenLabs: any paid plan unlocks library voices via the API; Starter is enough to start testing, Creator gives more credits for the hackathon.
