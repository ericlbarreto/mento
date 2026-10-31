# 2026-10-30 (time not recorded) — Teacher-side data guide, push to the PR, merge with main

- **Person / agent:** Person 3 (founder as proxy) / Claude Code (Opus 5.5)
- **Task id** (from your workstreams file): handoff to Person 1, process
- **Docs read first:** docs/teacher-data-integration.md, docs/10-decisions.md

## Prompt 1 of 4 (verbatim)

```text
Amigos, já a gente resolveu essa questão da latência. Eu queria que você gerasse seu contrato sobre a questão dos materiais, certo? A listagem de materiais, tudo isso, e também como que você está criando as questões no banco para que a pessoa da Tesk, da interface do professor, consiga puxar os dados que foram gerados para poder criar os insights. 

me de um .MD pra isso por favor
```

## Prompt 2 of 4 (verbatim)

```text
Primeiro, suba os commits no PR, por favor. Faça isso. Faça isso logo, porque a gente vai precisar mexer em algumas coisas, tá? Então, suba logo tudo. Acho que a gente vai talvez mexer em SPR e aí ver o que é que falta para ir iterando sobre isso.
```

## Prompt 3 of 4 (verbatim)

```text
ajeite os conflitos por favor, atualize com a main
```

## Prompt 4 of 4 (verbatim)

```text
Atualize também a pasta de prompts, por favor. , antes de eu mergear
```

## Outcome (English)

Wrote `docs/teacher-data-integration.md` for Person 1: subjects/materials/chunks collections and reusable functions, every conversation event with its exact payload, the evidence row, the two interfaces to implement with MongoDB (`TurnRepository`, `EvidenceStore`) and where to wire them, and how to build insights from the data. It states plainly that sessions, events and evidence are still in memory. Pushed all commits to PR #5 and rewrote its description. Merged `origin/main` (Person 2's start flow v2, decision D47): kept main's D47, renumbered this workstream's decisions to D48–D54, recorded in D54 how the implementation differs from D47 (subject documents with `subject_id`; the free whiteboard searches all materials), aligned `contracts-spec.md` §3/§9, `docs/03`, `docs/04` and `docs/16` with the code, and removed the "greet the student by name" instruction (names never go to the LLM). Updated `prompts/README.md` and `AGENTS.md` (the base prompt and subject profiles exist) and this log.

## Files changed

`docs/teacher-data-integration.md`, `docs/10-decisions.md`, `workstreams/contracts-spec.md`, `docs/03-tutor-and-prompts.md`, `docs/04-knowledge-and-sources.md`, `docs/16-technical-roadmap.md`, `prompts/README.md`, `AGENTS.md`, `prompts/sessions/03-whiteboard-backend/*`

## Decisions and contracts touched

Decisions renumbered D48–D54 (after main's D47); D54 records the differences from D47.

## Follow-ups / questions for other people

Person 2: the free whiteboard searches all materials (not "no material"); the session field is `subject_id`. Person 1: implement the Mongo `TurnRepository` and `EvidenceStore` (guide §4).

## Commit / PR

fdc7983 (guide), merge commit with main
