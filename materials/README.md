# materials/

Sample PDFs per subject and lesson, used by the ingestion script. **PDFs are not committed** (they may be copyrighted; see `.gitignore`). Agree within the team on how to share the files (e.g., a shared drive folder).

## Folder convention

```
materials/
  history/
    lesson-01-ancient-rome/
      slides.pdf
      book-chapter.pdf
    books/
      book-x.pdf
  math/                (optional, only if time allows)
```

- The first-level folder is the **subject**; the second-level folder is the **lesson**.
- The folder defines the link `subject → lesson → source`. The AI **never guesses** a PDF's subject.
- The content of the materials is in Portuguese (pt-BR); folder names are in English.
- Use material the team has the right to use (open educational resources, OpenStax, public domain, or self-authored). Check the hackathon IP rules.
- Test early whether each PDF has selectable text: scanned PDFs break source highlighting (see `docs/04-knowledge-and-sources.md`).
