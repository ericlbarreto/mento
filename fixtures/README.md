# fixtures

Recorded data with the real shapes (contracts-spec §10). Validated by `pnpm fixtures:check`.

- `turns/`: tutor turn scripts (Person 3).
- `events/`: conversation event logs (Person 3, read by Person 1).
- `seed/`: **mocked students** (profile, guardian, school history, current term) and the class context. `build.ts` generates the JSON; `pnpm seed` loads it into MongoDB.
- `analysis-lab/`: the lab material (lesson sequence) and 8 mock conversations that drive the analysis. See its README.
