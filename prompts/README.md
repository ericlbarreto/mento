# prompts/

Tutor prompts as plain text files, so anyone can iterate without touching code. See `docs/03-tutor-and-prompts.md`.

```
prompts/
  base.md              (to create) base tutor prompt: pedagogy, citation rules, modality, always answer in pt-BR
  personas.md          (to create) tutor personas: name, tone, TTS style mapping (optional; one default persona is enough)
  subjects/
    history.md         (to create) History profile; required for the demo
    math.md            (to create) Math profile; nice-to-have sketch
```

- Write instructions in **English**; the model answers the student in **pt-BR**.
- A subject's `profile_key` in the database selects the file in `subjects/`.
- Final prompt = base + subject profile + `subjects.prompt_notes` + retrieved excerpts + learner summary.
- After any change, rerun the fixed Rome test conversations (see `docs/14-working-rules.md`).
