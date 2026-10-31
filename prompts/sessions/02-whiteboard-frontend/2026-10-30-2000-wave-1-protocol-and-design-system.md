# 2026-10-30 20:00 — Wave 1: protocol mirror + mock, design system

- **Person / agent:** Person 2 (Robério) / Claude Code (orchestrator + implementer subagents, `prd-waves`)
- **Task id** (from your workstreams file): T0 (protocol + mock, prerequisite), T1
- **Docs read first:** AGENTS.md, docs/00, 01, 10, 14, 16, 18, 19, 21, workstreams/README.md, workstreams/02-whiteboard-frontend.md, workstreams/contracts-spec.md

## Prompt (verbatim)

```text
/prd-waves  planeja as ondas de todas as tasks Must (T1 a T10) do workstreams/02-whiteboard-frontend.md, mas não executa ainda.
[...] Escopo da execução, depois que eu aprovar o plano: execute SÓ as ondas 1 e 2 (por volta da metade das tasks Must). Uma PR por trilha, com o registro da onda no corpo da PR. Sem merge.
```

Approval: "siga" (all suggested defaults accepted).

## Outcome (English, 3–5 lines)

Planned T1–T10 in 4 waves / 10 tracks. Wave 1 ran two parallel tracks: (A) a local Zod mirror of the turn protocol in `packages/board`, Rome fixture turns and a typed API client with a mock mode (`NEXT_PUBLIC_MOCK_API=1`); (B) design tokens, base components (Button, IconButton, Chip, Card, Badge, Spinner) and the `/dev/ui` gallery with the day-0 pt-BR accents check (Caveat and Kalam render ã ç é õ â ê correctly).

## Files changed

- A: `packages/board/src/{protocol.ts,protocol.test.ts,mock/}`, `packages/board/fixtures/*.json`, `apps/web/src/lib/api.ts`
- B: `packages/ui/src/**`, `apps/web/src/app/(student)/dev/ui/page.tsx`, `apps/web/README.md` (Next 16 notes)

## Decisions and contracts touched

- No change to `packages/contracts`. Proposals (in PR A): stream `{turn_id}` / `{error}`, `ask_verification.id/verification_id/choices`, `MaterialSummary` fields.
- Fonts loaded via Google Fonts `@import` in `tokens.css` (root layout is not a Person 2 path); needs network on the demo machine.

## Follow-ups / questions for other people

- Person 3: confirm the stream/verification proposals and copy `protocol.ts` into `@mento/contracts`.
- Person 1: confirm `MaterialSummary` and `?ready_only=true`.

## Commit / PR

- A: https://github.com/ericlbarreto/mento/pull/1 · B: see PR "P2 T1"
