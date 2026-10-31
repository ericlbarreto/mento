# 2026-10-30 21:36 — Teacher backend scope: insights per session, severity sections, mocks and upload

- **Person / agent:** Person 1 / Claude Code
- **Task id** (from your workstreams file): plan
- **Docs read first:** workstreams/contracts-spec.md, docs/01-hackathon-scope.md, docs/06-teacher-interface.md, workstreams/handoffs-and-insights-pipeline.md

## Prompt 1 of 1 (verbatim)

```text
Quero que foque somente na parte do professor

- insights de cada aula de sessão de AI tutor, que vai ser uma rota que vai ser disparada depois da finalização da conversa (isso vai ter que ser o mais deterministico possivel, pois ele vai olhar toda a conversa do aluno e vai tirar insights disso, somente isso o professor vai ter acesso)
- vale ter uma tabela de insights por aluno, e uma sessão de insights (críticos, positivo e médio)
- visualização desses insights na pagina de detalhamento dos alunos
- tela de visualização dos alunos, dados pessoais deles, histórico escolar e tudo mais (precisamos fazer mockado) - planeje o mock e o seed
- planeje a parte de upload do conteúdo que vai ser dado (é com base nesse conteúdo que a IA vai dar o conteúdo)

Vamos planejar somente a parte do backend, entidades no banco e tudo mais
```

## Outcome (English)

Planned the backend only: a deterministic analysis run after a conversation ends, an insights table per student with critical / medium / positive sections, a student detail with mocked personal data and school history, a seed plan and the material upload. Proposed the rules table (R1, R3, M1, M2, P1, P2, P3), the MongoDB entities, the endpoints and the mock students.

## Files changed

- none (plan in chat)

## Decisions and contracts touched

- Proposed: severity on insights decided by rules (became D56); student profile and school history as read-only fictional mock (became D55).
- Asked the founder to confirm that student data is mock-only and never sent to an LLM.

## Follow-ups / questions for other people

- Confirm D55 with the founder (it refines the 'no gradebook' out-of-scope item).

## Commit / PR

- none
