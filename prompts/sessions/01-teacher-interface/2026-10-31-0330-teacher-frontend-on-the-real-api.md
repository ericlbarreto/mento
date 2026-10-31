# 2026-10-31 03:30 — Teacher front-end (home, student list, student page) on the real API

- **Person / agent:** Person 1 / Claude Code
- **Task id** (from your workstreams file): teacher UI
- **Docs read first:** docs/06-teacher-interface.md, docs/18-ui-references.md, the Stitch screens (professor "Alunos" and "Detalhes do aluno") and DESIGN.md

## Prompt (verbatim)

```text
/frontend-design Rode agora, pois iremos implementar agora o front end da parte do professor

Todas as partes relacionadas a ele, home principal com o dash

Pagina de detalhamento do aluno com os insights e da lista de todos os alunos

caminho do zip - /Users/mateusataide/Downloads/stitch_mento_ui_prompts

ai está todas as pastas e imagens necessárias
```

Follow-up (plan approval): "No final, espere para commitar, lembre que quando terminar me mostre tudo e nunca commit na main", then "execute tudo". Scope answers: bloco coletivo da turma continua mock; escopo = Alunos + detalhe ligados à API (Materiais fora).

## Outcome (English, 3–5 lines)

The teacher store now has an API provider (students, class context, insights, per-student detail, SSE refresh) and keeps the mock provider for `NEXT_PUBLIC_MOCK_API=1`. The Students tab and the student page were rebuilt after the Stitch screens: concept map, gaps with diagnosis and the student's words, next steps the teacher adopts or dismisses, history, conversations. Verified live in a browser (adopt, confirm, dismiss, edit the class notes, live refresh, mobile, API down); test data removed afterwards. Not committed: waiting for review, on branch `feat/teacher-frontend`.

## Files changed

- apps/web/src/app/(teacher)/professor/{page.tsx, alunos/[id]/page.tsx}
- apps/web/src/app/(teacher)/professor/_lib/{api,schemas,map,map.test,store,types,status}.ts(x)
- apps/web/src/app/(teacher)/professor/_components/{ClassContextCard,LoadState,ClassAnalysis}.tsx
- docs/{06,10}

## Decisions and contracts touched

- D69. No contract changed (response shapes of the teacher routes are local Zod schemas in the web app).

## Follow-ups / questions for other people

- Class-wide insights and interventions need an API concept (additive contract, D67); until then they stay simulated.
- Port 3000 was taken by another process on this machine; the web ran on 3100 with `WEB_ORIGIN=http://localhost:3100` on the API.

## Commit / PR

- not committed yet (branch `feat/teacher-frontend`)
