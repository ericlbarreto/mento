# 01: Investor business plan (PDF) and 5-minute pitch script

- **Person / agent:** Founder / Claude Code (side session started from the founder's main session)
- **Docs read first:** AGENTS.md, docs/00, 01, 09, 10, 11, 15, 20, the whiteboard back-end hand-off, frontend-integration, workstreams/, and the code state.

## Prompt (verbatim, Portuguese)

The founder's original message was sent to the main session and relayed to this one. The text below is the task exactly as this session received it (English wording with pt-BR language requirements); the founder's own words are in that main session.

```text
Task:
Create (1) a detailed business plan as a PDF for venture-capital investors and (2) a 5-minute hackathon pitch script with a live demo, for Mento. Language: the business plan and the pitch are for a Brazilian audience, so write both in Brazilian Portuguese (pt-BR); every file in the repository stays English except product text, so the file names and any repo docs about them are English while the PDF/script content is pt-BR.

Part 1, business plan PDF:
- First research which format venture-capital firms expect from an early-stage business plan / investment memo (sections, length, what VCs look for: problem, solution, market size TAM/SAM/SOM, product, business model, go-to-market, competition, traction, team, financials, roadmap, funding ask and use of funds, risks). Cite sources with dates; mark anything unverified.
- Study everything built so far before writing: start with AGENTS.md, docs/00-product-vision.md, docs/01-hackathon-scope.md, docs/09-market-and-competitors.md, docs/10-decisions.md, docs/11-technology-research.md, docs/15-studdy-teardown.md, docs/20-demo-runbook.md, docs/superpowers/handoff/2026-10-30-whiteboard-backend-handoff.md, docs/frontend-integration.md, the workstreams in workstreams/, and the real state of the code (apps/web, apps/api, packages/*; tutor, voice, retrieval, drawing, insights).
- Be strictly honest (AGENTS.md rules): there are NO paying customers, no proven efficacy and no closed partnerships; never present these as facts. Simulated data must be labeled. Market numbers, competitor facts and prices only with a source and a date. Costs of the stack can come from docs/11-technology-research.md and the real measurements in the hand-off doc; build unit economics from them and mark assumptions.
- Produce a polished, well-designed PDF saved in the repo under docs/business-plan/ together with its source file. Commit on a new branch from main named like feat/business-plan with commit messages feat(business-plan): <what you did> and NO co-author lines; open a pull request. Log the founder's prompt verbatim in prompts/sessions/ and update the relevant index.

Part 2, pitch:
- Research how hackathon pitches work, especially 5-minute pitches with a live demo (structure, timing per section, what judges score, common mistakes, how to handle a demo failure), with sources.
- Write the script in docs/business-plan/pitch-5min.md: minute-by-minute structure, the exact words to say (pt-BR) including strong opening hooks and memorable lines, the demo moments (what to click, say and show, using docs/20-demo-runbook.md), a Q&A prep list with likely judge/investor questions and honest answers, and a fallback plan if the demo or the network fails.

Done means: the PDF exists and reads well, the pitch script is complete and timed to 5 minutes, both are committed and pushed on the new branch, a PR is open, and the final message to the founder (reply in Portuguese) summarizes the plan's key claims, what is unverified or assumed, and what the founder must fill in (team, traction, funding ask) that cannot be known from the repository.
```

## Outcome (English)

Researched VC memo format and hackathon pitch practice (web, 2026-10-31), read the repo, and wrote a 23-page pt-BR PDF (HTML source rendered with headless Chrome) with tagged claims (fact / assumption / hypothesis / unverified), bottom-up TAM/SAM/SOM, unit economics from list prices (about R$ 1.3 to 2.5 per 10-minute voice session), scenarios, risks, and a founder-fill-in appendix. Wrote a timed 5-minute pitch with a demo table, fallbacks and 22 Q&A answers.

## Files changed

- docs/business-plan/ (README, plano-de-negocios-mento.html/.pdf, pitch-5min.md, assets/)
- docs/README.md, docs/10-decisions.md (D75), prompts/sessions/ (README row, 04-business-plan/)

## Decisions and contracts touched

- D75 in docs/10-decisions.md. No shared contract changed.

## Follow-ups / questions for other people

- Founder fills funding ask, team, traction; verify every "NÃO VERIF." item; check hackathon IP rules.

## Commit / PR

- Branch feat/business-plan (PR link in the final report).

## Follow-up prompt (verbatim, Portuguese), same day

```text
Eu não sei se esse plano de negócio está tão legal. Não sei se precisa já colocar questão de preços. Eu não sei se faz muito sentido. Precisa ser algo bem. Sobre a ideia, eu acho hackathon e tal, como a gente levar isso para o mercado, enfim, mas é
```

```text
@"/Users/eric/Downloads/Hackathon Desafios.pdf"
Cara, o nosso desafio, basicamente, é o desafio 3. Esse plano de negócio precisa ser voltado à tese do desafio 3, mostrando que a gente realmente resolve. Procure dados que a gente pode mostrar para que fique claro que realmente está resolvendo o problema tanto do lado do aluno como do lado do professor.
```

### Outcome (English)

Read the Challenges deck (46 pages; Challenge 3 = safe AI, saves time, preserves learning). Rewrote the plan as 12 pages organized around the three pillars, with student, teacher and school data (Cetic.br, TALIS 2024, Bastani PNAS 2025, Gallup 2025), a product-decision-to-evidence table, a pilot to measure effects, and no pricing or projections. Updated the pitch hook, closing blocks and Q&A to the same thesis; D75 rewritten.
