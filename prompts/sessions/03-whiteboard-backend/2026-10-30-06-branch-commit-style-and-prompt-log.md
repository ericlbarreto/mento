# 2026-10-30 (time not recorded) — Branch, commit style and prompt log for the back-end

- **Person / agent:** Person 3 (founder as proxy) / Claude Code
- **Task id** (from your workstreams file): process
- **Docs read first:** prompts/sessions/README.md, docs/14-working-rules.md

## Prompt 1 of 2 (verbatim)

```text
crie uma branch chamada feat/whiteboard-api, dai os commits voce vai seguir o padrao

feat(whiteboard): what you did 

nao commite com coauthoir por favor
```

## Prompt 2 of 2 (verbatim)

```text
pode escrever todos os prompts dessa parte do backend que estamos implementando na pastinha do backend do whiteboard amigo? desde o momneto que ocmeçando a implementar a api por favor.
```

## Outcome (English)

Created the branch `feat/whiteboard-api`. Commit messages follow `feat(whiteboard): <what was done>` and carry no co-author lines. Wrote this prompt log (entries 01–06) from the start of the API scaffold to now.

## Files changed

`prompts/sessions/03-whiteboard-backend/*`

## Decisions and contracts touched

Working rule for this workstream: branch `feat/whiteboard-api`, commit style `feat(whiteboard): ...`, no co-author trailer.

## Follow-ups / questions for other people

Keep logging new prompts here as the plans are executed (use `_template.md`).

## Commit / PR

This entry's commit on `feat/whiteboard-api` (see `git log`).
