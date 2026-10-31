# 2026-10-30 (time not recorded) — Why the first tutor action takes ~4 s

- **Person / agent:** Person 3 (founder as proxy) / Claude Code (Opus 5.5)
- **Task id** (from your workstreams file): T11 (latency)
- **Docs read first:** spec §11, Anthropic docs (extended thinking, effort)

## Prompt 1 of 2 (verbatim)

```text
Eu quero entender qual é a latência que está atualmente. Por que está demorando 4 segundos?
```

## Prompt 2 of 2 (verbatim)

```text
eu posso pegar qualquer plano aqui na elevenlabs?

[image: ElevenLabs subscription page with Free, Starter, Creator, Pro and Scale plans and the ElevenCreative / ElevenAgents / ElevenAPI tabs]
```

## Outcome (English)

Measured a realistic turn stage by stage (temporary script, removed): search ~0.6–1.0 s (mostly the Voyage query embedding), then Sonnet 5.5 produced a `thinking` block for ~3 s before its first tool call; the first `speak` closed at 4.3–5.4 s from the start. Cause: adaptive thinking is on by default at `high` effort on Sonnet 5.5. Per the Anthropic effort docs, `thinking: {"type": "between_tools"}` turns off up-front thinking on Sonnet 5.5 and `output_config.effort` lowers it (Haiku 5.5 accepts `thinking: {"type": "disabled"}`). The comparison run was stopped by the founder (latency handled separately); no code change was made.

## Files changed

none in the repository

## Decisions and contracts touched

Candidate fix (not applied): `thinking: { type: "between_tools" }` and a lower `effort` on the tutor request, plus taking the query embedding off the critical path.

## Follow-ups / questions for other people

Whoever owns the latency work: apply and measure the setting above with `pnpm turn:bench`.

## Commit / PR

none
