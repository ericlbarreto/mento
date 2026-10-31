# Analysis lab

Mock conversations and a mock material used to develop and test the conversation → insights analysis. All data is fictional. The engine itself lives in `packages/analysis`; this folder only holds the **inputs**.

| File | What it is |
|---|---|
| `material.json` | Mock of what ingestion extracts from the teacher's PDF: the **ordered lesson sequence** (summary, key concepts, activities, prerequisites, `taught_in_class`). The analysis traces a difficulty back to an earlier lesson through `prerequisites` |
| `scripts.json` | Hand-editable conversation scripts (5 students, 8 conversations, each with the `lesson_id` being studied) + class context |
| `build.ts` | Expands the scripts into `conversations.json` and validates the result with the Zod schemas of `@mento/contracts` |
| `conversations.json` | **Generated.** Contract-shaped sessions, events (with `seq`) and evidence (`contracts-spec.md` §2–5). Read by `FileConversationSource`; **not stored in MongoDB** |

```bash
pnpm exec tsx fixtures/analysis-lab/build.ts   # regenerate conversations.json after editing scripts.json
pnpm fixtures:check                            # every fixture parses with the contracts
pnpm seed && pnpm seed:lab --analyze           # load students + material and run the real analysis into MongoDB
pnpm test:rules                                # business-rule report (BR-01 … BR-24)
```

The expected result of analysing these conversations is the golden scenario (BR-17) in `packages/analysis/test/golden.test.ts`. The analysis prompt is `prompts/analysis.md`.

Ids here are readable strings (`stu_01`, `ses_ana_01`, `ses_ana_01_e02`); the loader maps `stu_*` and `mat_roma` to the ids of the seeded MongoDB documents through their `fixture_id`.
