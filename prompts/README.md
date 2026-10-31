# prompts/

Tutor prompts as plain text files, so anyone can iterate without touching code. See `docs/03-tutor-and-prompts.md`.

```
prompts/
  base.md              base tutor prompt: pedagogy, tool use order, citations, hints, concept labels, safety, always answer in pt-BR
  subjects/
    history.md         History profile (demo)
    generic.md         fallback profile for subjects without their own file
    math.md            (not written yet) Math profile; nice-to-have
  personas.md          (not written yet) tutor personas and TTS style mapping (optional)
  sessions/            prompt logs per workstream (not loaded by the tutor)
  founder-conversation/  the founder's original instructions (not loaded by the tutor)
```

- Write instructions in **English**; the model answers the student in **pt-BR**.
- **`sessions/`** holds one folder per workstream (teacher interface, whiteboard front-end, whiteboard back-end) where each person logs the prompts they send to their agent; it is **not** loaded by the tutor either.
- **`founder-conversation/`** is **not** a tutor prompt: it holds the founder's own instructions (verbatim prompts, consolidated requirements, traceability). The tutor never loads it.
- Every file in `subjects/` is loaded at startup (`loadPromptsSync` in `packages/tutor/src/prompts.ts`) and **all profiles go into the cached system prompt**; the session's subject (`subjects.key`, e.g. `history`) tells the tutor which profile to apply, and a free whiteboard uses `generic`. Adding a subject profile = adding `subjects/<key>.md` (no code change).
- Final prompt (`packages/tutor/src/prompt-builder.ts`) = cached system blocks [base + all subject profiles + class context + subject of the session + learner summary] [catalog of the session's materials] + one user message per turn [transcript, board snapshot, retrieved passages, new input, modality].
- After any change, rerun the fixed Rome test conversations (see `docs/14-working-rules.md`).
