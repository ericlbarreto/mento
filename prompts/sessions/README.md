# prompts/sessions — one folder per workstream, to log the prompts as we build

> **Not used by the tutor.** These folders are the team's **working memory**: each person logs the prompts they send to their AI agent while building their part, so decisions and intent are never lost. The brainstorming conversation that started everything is in [`../founder-conversation/`](../founder-conversation/README.md).

| Folder | Person | Workstream | Plan |
|---|---|---|---|
| [`01-teacher-interface/`](01-teacher-interface/README.md) | **Person 1** | Teacher interface + data + materials + insights | `workstreams/01-teacher-interface.md` |
| [`02-whiteboard-frontend/`](02-whiteboard-frontend/README.md) | **Person 2** | Whiteboard front-end (+ design system) | `workstreams/02-whiteboard-frontend.md` |
| [`03-whiteboard-backend/`](03-whiteboard-backend/README.md) | **Person 3** | Whiteboard back-end (tutor, STT/TTS, orchestration) | `workstreams/03-whiteboard-backend.md` |

## Each folder contains

| File | Purpose |
|---|---|
| `README.md` | Scope of the workstream, which docs to read first, rules |
| `00-starter-prompt.md` | A ready-to-paste **first prompt** for your agent session |
| `_template.md` | Template for one prompt-log entry |
| `log.md` | Index of the entries (date, title, task, commit) |
| `YYYY-MM-DD-hhmm-<topic>.md` | One entry per meaningful prompt/session (copy `_template.md`) |

## How to log (2 minutes per entry)

1. Copy `_template.md` to `YYYY-MM-DD-hhmm-<topic>.md` in **your** folder.
2. Paste the prompt **verbatim** (Portuguese is fine; typos stay), then write 3–5 lines in **English**: outcome, files changed, decisions, follow-ups, commit.
3. Add a row to `log.md`.
4. **Alternative (bulk):** export the session from the Claude desktop app (session menu → Export), unzip, and run `python3 ../../founder-conversation/tools/build_prompt_log.py --main <path>/transcript.jsonl --out prompts-verbatim-<date>.md` from your folder; then summarize in `log.md`.

## Rules

- **Only your folder**; do not edit other people's logs.
- **No secrets** (keys, tokens, `.env` contents), no real student data.
- If a prompt **changes a shared contract**, also update `workstreams/contracts-spec.md` and tell the other two (`workstreams/README.md`).
- If a prompt **changes scope or a decision**, update `docs/10-decisions.md` and the topic doc in the same commit.
- Keep entries short; the code and docs are the source of truth, the log is the *why*.
