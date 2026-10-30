# prompts/

Tutor prompts as plain text files, so anyone can iterate without touching code. See `docs/03-tutor-and-prompts.md`.

```
prompts/
  base.md              (to create) base tutor prompt: pedagogy, citation rules, modality, always answer in pt-BR
  personas.md          (to create) tutor personas: name, tone, TTS style mapping (optional; one default persona is enough)
  subjects/
    history.md         (to create) History profile; required for the demo
    math.md            (to create) Math profile; nice-to-have sketch
    generic.md         (to create) fallback profile for materials with subject "Outro" or unknown
```

- Write instructions in **English**; the model answers the student in **pt-BR**.
- **`sessions/`** holds one folder per workstream (teacher interface, whiteboard front-end, whiteboard back-end) where each person logs the prompts they send to their agent; it is **not** loaded by the tutor either.
- **`founder-conversation/`** is **not** a tutor prompt: it holds the founder's own instructions (verbatim prompts, consolidated requirements, traceability). The tutor never loads it.
- A material's `profile_key` (from the subject chosen at upload) selects the file in `subjects/`; `generic.md` is the fallback.
- Final prompt = base + subject profile + **class context** (grade level + teacher description) + retrieved excerpts of the chosen material + learner summary + topic.
- After any change, rerun the fixed Rome test conversations (see `docs/14-working-rules.md`).
