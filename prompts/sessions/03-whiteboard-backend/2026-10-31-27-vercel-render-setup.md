# 27: Connecting the Vercel web to the Render API

## Prompts (verbatim, Portuguese)

> Pode ser o Greptile? Você já incluiu ele no CICD ou não?

> Ah, entendi, pronto. Tu consegue ir usar meu cloud no Chrome para poder criar o Greptile por

> Seguinte: a gente subiu a API no Render, que é outro lugar diferente da Vercel, e eu queria entender quais envs eu preciso setar, incluindo a rota apontando pra api sabe

> pq que ta chamando localhost? eu ja ajeitei o front end irmao/ _(with a screenshot of the web app on mantoai.vercel.app showing "Não conseguimos falar com o servidor" and failed `subjects` and `students` requests in DevTools)_

> _(a screenshot of the Vercel Environment Variables page with `NEXT_PUBLIC_API_URL` = `https://mento-7m5j.onrender.com`, scope Production)_

> Crie um PR com algo, não sei, com prompt, por favor, só para poder mergear na main e fazer o redeploy.

## What was found and done

- Greptile is a GitHub App installed from the vendor's site: nothing to add to the CI (documented in `docs/ci-cd.md`, PR #34). Creating the account and authorising the app is the founder's step; it was not done from here.
- Web (Vercel) needs `NEXT_PUBLIC_API_URL` (build-time, so it needs a new build); API (Render) needs `WEB_ORIGIN` with the scheme.
- The live bundle at `mantoai.vercel.app` still contained `localhost:4000` and no Render address: the web had not been rebuilt after the variable was set.
- The Render API was healthy (`/api/health` 200, `mongo: connected`) but answered `access-control-allow-origin: mantoai.vercel.app` (no `https://`): `WEB_ORIGIN` must be `https://mantoai.vercel.app`.
- This file exists so that a commit on `main` triggers a fresh Vercel build of the web with the new variable.
