# 2026-10-31 09:15 — The teacher edits generated exercise lists (and merge into main)

- **Person / agent:** Person 1 / Claude Code
- **Task id** (from your workstreams file): teacher-ui (exercise lists)
- **Docs read first:** AGENTS.md, docs/10-decisions.md, docs/06-teacher-interface.md, workstreams/contracts-spec.md §16

## Prompt (verbatim)

```text
Analise e veja a possibilidade para o implementar uma edição do PDF das questoes geradas

Quero que ele consiga editar o texto das mensagens, adicionar e excluir também as mensagens e as questões geradas pela IA. Analise e planeje isso. Não cometi na `main`. Crie uma branch, rode localmente e me envie aqui para eu poder validar.
```

Follow-ups in the same session:

```text
Crie uma branch, e mergeei ela na main, se não tiver conflitos
```

```text
resolva os conflitos, e ainda lembre de colocar na pasta os prompts da sessão
```

## Outcome (English, 3–5 lines)

On a ready exercise list, **Editar questões** opens an editor (wide modal) for the title and every question: prompt, options and the right one, expected answer, why, book page; add (choice or open), delete and reorder questions; add/remove options (2–6). Validation messages in pt-BR block saving; closing with unsaved changes asks first. Saved with `PATCH /api/exercise-lists/:id`; both PDFs are rebuilt from the saved list, the card says "revisada por você" and the teacher PDF note says the questions were reviewed by the teacher. "Texto das mensagens" was read as the texts of the questions. Run locally on web :3200 / API :4100 (the default ports were taken by another checkout). The first merge attempt conflicted only in `docs/10-decisions.md` (main had taken D81 and D82), so the decision was renumbered to D83 and the branch merged.

## Files changed

- `packages/contracts/src/exercises.ts` (`edited_at`, `ExerciseInput`, `UpdateExerciseListBody`), `packages/db/src/models/exercise-list.model.ts`
- `packages/analysis/src/exercises/service.ts` (`edit`), `apps/api/src/routes/exercise-lists.ts` (PATCH), `apps/api/test/exercise-lists.test.ts`
- `apps/web/src/app/(teacher)/professor/_components/{ExerciseListEditor,ExerciseLists,ui,icons}.tsx`
- `apps/web/src/app/(teacher)/professor/_lib/{exercise-draft,exercise-draft.test,exercise-pdf,exercise-pdf.test,api}.ts`, `store.tsx`
- `docs/10-decisions.md` (D83), `docs/06-teacher-interface.md` §1.6, `workstreams/contracts-spec.md` §16

## Decisions and contracts touched

- D83 (teacher edits generated exercise lists). Contract: contracts-spec.md §16 (additive: `edited_at`, `UpdateExerciseListBody`, PATCH route).

## Follow-ups / questions for other people

- `Modal` (`_components/ui.tsx`) gained a `wide` prop and routes Esc through `onClose` (so a form can keep the dialog open on unsaved changes).

## Commit / PR

- branch `feat/edit-exercise-lists`, merged into main
