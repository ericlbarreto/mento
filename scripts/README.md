# scripts

Dev/ops scripts run with `tsx` from the repo root.

| Command | What it does |
|---|---|
| `pnpm seed [--reset] [--db <name>]` | Loads the mocked students and the class context into MongoDB. Idempotent. `--reset` clears only the teacher collections of that database |
| `pnpm seed:lab [--analyze] [--rebuild] [--db <name>]` | Loads the lab material (lesson sequence). `--analyze` runs the real analysis for the lab conversations (read from JSON, not stored) and stores `analyses` and `insights` |
| `pnpm db:stats [--db <name>]` | Counts per teacher collection and insights by kind / severity / status |
| `pnpm fixtures:check` | Every fixture parses with the Zod contracts |
| `pnpm test:rules` | Runs all tests once and prints the business-rule report (BR-01 … BR-24); fails if a rule is red or has no test |
| `pnpm e2e:teacher [--keep]` | seed → analysis → the real API over HTTP → upload, on a throwaway database `mento_e2e` |
| `pnpm ingest`, `pnpm retrieval:check`, `pnpm voice:smoke`, `pnpm llm:smoke`, `pnpm turn:bench`, `pnpm images:pregenerate`, `pnpm turn` | Whiteboard back-end scripts (Person 3) |

The database is `--db`, else `MONGODB_DB`, else the one named in `MONGODB_URI`, else `mento` (never the Atlas default `test`). Integration tests use `mento_test_*` databases and drop them.
