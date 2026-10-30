# Starter prompt — Person 1 (Teacher interface + data + materials + insights)

> Paste this as the **first message** of your agent session. You can talk to the agent in Portuguese afterwards.

```text
Study the repository (read AGENTS.md first). I am Person 1: Teacher interface + data + materials + insights.
Read workstreams/README.md, workstreams/01-teacher-interface.md, workstreams/contracts-spec.md and
workstreams/handoffs-and-insights-pipeline.md, plus the docs listed in prompts/sessions/01-teacher-interface/README.md.
Edit only my paths (workstreams/README.md, "Path ownership"). Do not rename any field defined in
contracts-spec.md.

Before writing code, reply with: (1) a summary of my scope, (2) the contracts I must not break,
(3) my day-0 checks and my first three tasks with estimates, (4) what I need from the other two people
and the mock I will use until it exists, (5) any doubt about the docs.

Then start with: day-0 checks (ingest a real book PDF and time it; SQLite FTS with Portuguese queries; analysis dry run on a fixture event log), then T1 (schema + SQLite repository + seed, delivered by hour 3).

Use the `impeccable` skill for every screen (fallback: `frontend-design`).
Log each meaningful prompt of this session in prompts/sessions/01-teacher-interface/ (see prompts/sessions/README.md).
```
