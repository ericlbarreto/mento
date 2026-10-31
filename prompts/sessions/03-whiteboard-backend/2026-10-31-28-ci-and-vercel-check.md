# 28: CI and deploy check, and the Vercel block

## Prompts (verbatim, Portuguese)

> Verifique se os CI/CD estão passando tudo direitinho.ou  Tá falhando alguma coisa, por favor?

> Ai, irmão, faça aí um PR. Vai lá, bota prompt só para poder mergear na main

(Earlier in the same stretch: the CORS and `WEB_ORIGIN` debugging with screenshots of the browser DevTools, "o que ta rolando aqui amigo?", "pq que ta retornando 200 mas fica como failed a request?" and "cara eu ja redeployei o backend no render mas continua dando problema irmao, o que eh isso ein? preciso resolver AGORA MESMO". The cause was `WEB_ORIGIN` without `https://` on Render; fixed on the Render dashboard.)

## What was found

- GitHub Actions `check` (typecheck, lint, tests, fixtures) passes on every pull request and on the latest `main`. Two `main` runs were cancelled by the "cancel superseded runs" setting when two merges came close together.
- Vercel is what fails: `Vercel – web` reports "Git author roberiof must have access to the project on Vercel to create deployments", and the latest `main` commit (merged by Robério) shows "Deployment was blocked". `Vercel – api` is a second Vercel project for the repository that always fails; the API is on Render.
- With Render's "After CI Checks Pass", failing Vercel checks on a commit may make Render skip the API deploy.
- This entry exists so the founder can merge a commit on `main`, which makes Vercel build the web with the founder as the commit author.
