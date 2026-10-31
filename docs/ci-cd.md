# CI and deploy gate

> Written 2026-10-31. The workflow runs on GitHub; the Render and review-bot steps are done in their dashboards and were not run from here.

## What runs

`.github/workflows/ci.yml`, job `check`, on every pull request and every push to `main`:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test` (every package; the tests that need MongoDB Atlas are skipped without `ATLAS_TEST_URI`)
5. `pnpm fixtures:check`

A newer push to the same branch cancels the older run. The job times out after 15 minutes.

## Make Render wait for it (the actual "tests before deploy")

The repository is private on a GitHub Free account, where branch protection is not available, so GitHub cannot stop a merge by itself. Put the gate on the deploy side instead:

Render → the API service → **Settings → Build & Deploy → Auto-Deploy → "After CI Checks Pass"**.

Render then waits for the commit's GitHub checks: it deploys only if they all pass, and skips the deploy if any fails or if there are none ([Render docs](https://render.com/docs/deploys)). The `check` job above is that check, so a red `main` never reaches production. The same setting on the web service gates the web deploy.

To block the merge as well (not only the deploy): make the repository public, or move it to a GitHub plan with branch protection, then require the `check` job on `main`. Until then, merge only green pull requests.

## AI code review (optional)

Checked 2026-10-31 on the vendors' pricing pages:

| Tool | Free for a private repo? | Notes |
|---|---|---|
| [Greptile](https://www.greptile.com/pricing) | **Starter plan is free**: 1 active developer, 50 credits a month, unlimited repositories (the page does not say whether private repositories are included: try it on this one) | Pro is $1 per credit, with a 14-day trial; free for qualified open-source projects; 500 free credits a month for 6 months for pre-Series A startups |
| [CodeRabbit](https://www.coderabbit.ai/pricing) | **No.** Free forever only for public repositories; private repositories get a 14-day trial, then Essentials is $24 per user a month (annual) | Install it on a public repository for free reviews |

Setup for either is a GitHub App installed on the repository from the vendor's site; no change to this repository is needed. Findings are comments on the pull request, and neither replaces the `check` job.
