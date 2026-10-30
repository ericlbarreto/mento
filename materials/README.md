# materials/

Sample **PDFs** (e.g., a history book) used by the **ingestion script** (`scripts/ingest.ts`) and as test files for the teacher's upload. **PDFs are not committed** (they may be copyrighted; see `.gitignore`). Agree within the team on how to share the files (e.g., a shared drive folder).

```
materials/
  historia-roma-antiga.pdf        (example)
```

- There is **no subject/lesson folder structure**. The teacher uploads PDFs in the **Materials tab**; the script is the fallback and runs the same pipeline.
- The subject (História, Matemática, ...) is chosen at upload (or via a script argument) and selects the tutor's subject profile.
- Content is in Portuguese (pt-BR); file names are in English or plain ASCII.
- Use material the team has the right to use (open educational resources, public domain or self-authored). Check the hackathon IP rules.
- Test early whether the PDF has a **text layer** (selectable text) and how many pages it has: scanned or very large PDFs raise cost and break highlighting (`docs/04-knowledge-and-sources.md`).
