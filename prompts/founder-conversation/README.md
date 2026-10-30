# Founder conversation — prompts, requirements and traceability

> **Not used by the tutor.** The runtime tutor prompts live in `prompts/base.md`, `prompts/subjects/` and `prompts/personas.md` (see `../README.md`). This folder is the **memory of the founder's instructions**, so any person or AI agent (on any computer) can see **what was asked, why, and where it landed**.

## What is here

| File | What it is |
|---|---|
| [`prompts-verbatim.md`](prompts-verbatim.md) | **Every message the founder sent** (P01–P41 main session, F01–F02 forked session), word for word, in the original Portuguese, in chronological order |
| [`consolidated-requirements.md`](consolidated-requirements.md) | All requirements and decisions merged **by theme** (product, scope, tutor, technical, UI/brand, process), each with the prompts it comes from, plus the assistant's interpretations that still need confirmation |
| [`traceability.md`](traceability.md) | One row per prompt: what was asked → what was produced and in which document |
| `tools/build_prompt_log.py` | Script that regenerates the verbatim log from an exported session transcript (see below) |

## How it was produced

The log was **not retyped**: it was extracted programmatically from the **exported session transcripts** (the app's session menu → Export) of the main session ("Mento hackathon feature prioritization") and its fork. Only the founder's messages were read; assistant replies and tool output were ignored. System notices were stripped, pasted blocks are marked, and images are not reproduced (a note says what each image was). Messages sent **while the assistant was working** are included.

> The export zip files were written to `~/Downloads` and are **not** in the repository (they are ~18 MB each and contain the full assistant output).

## How to update it after new sessions

1. In the Claude desktop app: session menu → **Export**; unzip the file.
2. Run (from this folder):
   ```bash
   python3 tools/build_prompt_log.py --main <path>/transcript.jsonl --fork <path-to-fork>/transcript.jsonl --out prompts-verbatim.md
   ```
   (`--fork` may be repeated; add per-prompt notes to `tools/notes.json`, keyed by UTC minute.) For a **new** session, export it and merge by hand or extend the script; numbering restarts per run.
3. Then extend `traceability.md` and `consolidated-requirements.md` for the new prompts.

## Conventions and caveats

- The prompts are **voice-dictated Portuguese**: typos and speech-to-text slips are preserved on purpose ("speed to speed" = speech-to-speech, "Danix" = Deepgram, "Story" = Studdy, "notarla" = "a nossa IA", "set" = "sete"/7). The assistant's readings of unclear passages are listed in `consolidated-requirements.md` §8.
- Repository language policy still holds: everything except these verbatim prompts is in English.
- The founder's tone includes casual language; keep it verbatim, or redact before making the repository public.
- Two files mentioned by the founder are **not** in the repository: `Hackathon Desafios.pdf` (challenge brief, referenced in F01). `Mento_Company_Brief.md` **is** (`docs/reference/`).
- The log reflects the sessions **as of 2026-10-30**; later instructions must be added.
