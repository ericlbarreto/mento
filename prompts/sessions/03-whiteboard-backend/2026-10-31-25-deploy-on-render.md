# 25: Add the prompts and deploy the API on Render

## Prompts (verbatim, Portuguese)

> Adiciona os prompts
>
> É o seguinte, meu querido: quero fazer deploy na Render, principalmente do backend, que é o que fica em apps/api, porque o web já está deployado. Aí eu preciso dos comandos de build. Se você puder me gerar os comandos de build, ficarei feliz.

## What was done

- The prompt log was brought up to date (entries 22–25, `all-prompts.md`).
- `docs/deploy-render.md`: build and start commands, settings, environment variables, disk, Atlas access and checks for deploying `apps/api` on Render. Verified on a clean checkout.
- `apps/api/src/config.ts` now reads `PORT` (Render sets it); `API_PORT` still wins. Test in `config.test.ts`.
