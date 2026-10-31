# Mento documentation

Index. Documents are numbered in suggested reading order. **00, 01, 10 and 14 are mandatory** for anyone working on the project.

| # | Document | Purpose |
|---|---|---|
| 00 | [Product vision](00-product-vision.md) | What it is, for whom, problem, thesis, what it is not |
| 01 | [Hackathon scope](01-hackathon-scope.md) | **Source of truth for scope**: product model, Must/Should/Nice/Out, cut order, schedule, demo script |
| 02 | [Student experience and whiteboard](02-student-experience-whiteboard.md) | Board, click-and-ask, text/voice modes, operations protocol |
| 03 | [Tutor and prompts](03-tutor-and-prompts.md) | 3-layer prompt, subject profiles, pedagogical rules |
| 04 | [Knowledge and sources](04-knowledge-and-sources.md) | Materials (PDF books): upload/ingestion, retrieval for books, citation and highlight |
| 05 | [Learner model and analysis](05-learner-model-and-analysis.md) | Evidence, post-session analysis, what the AI identifies about a student |
| 06 | [Teacher interface](06-teacher-interface.md) | Single-teacher workspace: Students and Materials tabs, class context, metrics, insights |
| 07 | [Architecture and data](07-architecture-and-data.md) | Components, minimal schema, event contract, voice |
| 08 | [Privacy, ZDR and security](08-privacy-zdr-security.md) | LGPD, minors, ZDR, limits on what the AI may infer |
| 09 | [Market and competitors](09-market-and-competitors.md) | Teachy, competitors, positioning (with verification warnings) |
| 10 | [Decisions](10-decisions.md) | Log of decisions made and open questions |
| 11 | [Technology research](11-technology-research.md) | Voice, prices, frameworks (dated, unverified; tldraw no longer the plan) |
| 12 | [Glossary](12-glossary.md) | Project vocabulary |
| 13 | [Technical discovery](13-technical-discovery-and-split.md) | Stack decisions checklist and day-0 checks |
| 14 | [Working rules](14-working-rules.md) | How we work in parallel |
| 15 | [Studdy teardown](15-studdy-teardown.md) | How a whiteboard tutor works under the hood (observed on Studdy, 2026-10-30) |
| 16 | [Technical roadmap](16-technical-roadmap.md) | **Build plan**: turn protocol, tools, board, drawing pipelines, voice, order, lanes |
| 17 | [Work split](17-work-split.md) | **3 parallel lanes**, directory ownership, contracts, checkpoints, per-lane Must/Should/Nice tasks |
| 18 | [UI references](18-ui-references.md) | Shared design language, student orb UI, Flint-inspired teacher UI, shared components |
| 19 | [Brand assets](19-brand-assets.md) | Chosen logo, mascot and GIFs, sampled brand colors, orb state mapping, where files go |
| 20 | [Demo runbook](20-demo-runbook.md) | Preparation checklist, demo script with checks, fallbacks, honesty rules |
| 21 | [Repository structure](21-repo-structure.md) | **Monorepo layout**, packages, dependency rules, root config, scripts, CI, ownership by path, kickoff K1 checklist |
| — | [business-plan/](business-plan/README.md) | **Investor business plan (PDF, pt-BR)** and the **5-minute pitch script with live demo**; assumptions and what the founder must fill in |
| — | [../workstreams/](../workstreams/README.md) | **Division of work among the 3 people**: teacher interface + insights, whiteboard front-end, whiteboard back-end, handoffs |
| — | [../prompts/sessions/](../prompts/sessions/README.md) | **Per-person prompt logs and starter prompts** (teacher interface, whiteboard front-end, whiteboard back-end) |
| — | [../prompts/founder-conversation/](../prompts/founder-conversation/README.md) | **The founder's prompts (verbatim), merged requirements and traceability** to the docs |
| — | [reference/Mento_Company_Brief.md](reference/Mento_Company_Brief.md) | Original full brief (Portuguese; includes long-term vision) |

## Document conventions

- Each document starts with **status** and **last updated**.
- Statements are labeled: **[Decision]**, **[Hypothesis]**, **[Verified]**, **[Unverified]**, **[Out of scope]**.
- Market numbers, prices and third-party features change fast: always dated and sourced.
