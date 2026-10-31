# 29. The drawing is not generated

## Prompt (verbatim, pt-BR)

> O desenho não está sendo gerado. Você pode investigar, por favor, até testando no próprio Cloud in Chrome? Por que não está gerando o desenho? O que é que está rolando?

(A screenshot showed a drawing placeholder stuck on "Desenhando…".)

## What was done

- Called `GeminiImageClient` directly: `RESOURCE_EXHAUSTED`, "Your prepayment credits are depleted". The image provider is out of credits (needs a top-up in AI Studio).
- Second bug: on any generation failure the server sends `update_element` for the drawing id, but the reducer only accepted text there, so the placeholder never settled and showed "Desenhando…" forever. The reducer now settles a pending drawing as failed, so the renderer shows "Não consegui desenhar" with the prompt as caption. Test in `reducer.test.ts`.
