# Writing brief — Mento demo textbooks (8º ano)

Shared rules for every book in `materials/src/<key>/`. Source of truth: `prompts/sessions/02-whiteboard-frontend/plans/E-demo-materials.md` (FINAL section).

## Files per book
- `materials/src/<key>/book.md` — the whole book in Markdown (pt-BR).
- `materials/src/<key>/facts.md` — fact table: every date, number, law, constant and named fact in the book → public source (title, URL, access date 2026-10-31). One row per fact.
- `materials/src/<key>/answers.md` — answer key for all exercises (NOT part of the PDF the tutor reads).
- `materials/src/<key>/demo.md` — 3 demo questions a student could ask, each with the chapter/section that answers it.

## Markdown conventions (the renderer depends on them)
- Line 1: `# <Book title>` then a line `<subtitle>` (e.g. "Ciências da Natureza · 8º ano").
- Then `## Sumário` (the renderer builds the dotted TOC; you just list chapter titles one per line as `- Capítulo N — Título`).
- Each chapter starts with `## Capítulo N — Título` (exactly this form, em dash, no `;` in titles). Sections `###`.
- Boxes: a blockquote starting with a bold label, e.g. `> **Você sabia?** …`, `> **Glossário** …`, `> **Fonte histórica** …`, `> **Experimento** …`, `> **Atenção** …`. Start box text with a full sentence.
- Timelines: a Markdown table with columns `Ano | Acontecimento`.
- Tables: small (≤ 6 rows, ≤ 4 columns).
- Math: plain text with Unicode (x², 3,5 × 10⁸, ½, √, ≈, °C). No LaTeX.
- Exercises: `### Atividades` with a numbered list (6–10 items). No answers in book.md.
- End of each chapter: `### Resumo do capítulo` (4–6 bullets) before Atividades.
- Last section of the book: `## Referências` (all sources used, URL + access date).
- No images (the tutor draws on the board). No HTML.

## Content rules
- Audience: 13–14 years old, 8º ano, BNCC-aligned. Short paragraphs (3–5 sentences), define each term the first time (bold the term), concrete examples from Brazilian everyday life.
- Length: 25–40 A4 pages when printed ≈ **9.000–14.000 words** for the whole book. Each chapter opens with a question-problem ("Por que…?").
- **Original text only.** Research facts on the web (BNCC, gov.br/MEC, IBGE, Arquivo Nacional, Fiocruz, Ministério da Saúde, Wikipedia pt for facts), but never copy or closely paraphrase sentences from textbooks, Brasil Escola, Mundo Educação, Toda Matéria or Wikipedia. Public-domain historical documents (laws, constitutions) may be quoted briefly (≤ 3 lines) with the source.
- Accuracy over flourish: every date/number must appear in facts.md with a source. If unsure, leave it out.
- Neutral, respectful, inclusive. History: include Black and Indigenous agency, not only elites. No political opinions about the present.
- No learning styles, no psychological claims about students.
- Cover note (renderer adds it): "Material original produzido pela equipe Mento com apoio de IA, para demonstração."
