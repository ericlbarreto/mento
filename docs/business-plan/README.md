# Business plan and pitch

> Content is in Brazilian Portuguese (pt-BR) because the audience (Brazilian investors and hackathon judges) is Brazilian; file names and this README are English (AGENTS.md language policy).

| File | What it is |
|---|---|
| `plano-de-negocios-mento.pdf` | Business plan (13 pages) answering Teachy Challenge 3 (safe AI, saves time, preserves learning): problem with data (student, teacher, school), how each product decision answers it, platform screenshots, pilot design to measure it, market, competition (centralized platform vs point solutions), the YC "The Primer" reference, roadmap, sources and assumptions. No pricing or financial projections |
| `plano-de-negocios-mento.html` | **Source** of the PDF (single file; images in `assets/`) |
| `pitch-5min.md` | 5-minute pitch script with live demo: minute-by-minute words, demo steps, fallback plan, Q&A prep, research sources |
| `assets/` | Logo and mascot used by the PDF (copies of `assets/brand/`), and `assets/screens/` with the platform screenshots (fictional demo students) |

## Rebuild the PDF

macOS with Google Chrome installed:

```bash
cd docs/business-plan && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf=plano-de-negocios-mento.pdf file://$PWD/plano-de-negocios-mento.html
```

## What the founder must fill in (cannot be known from the repository)

The ask (partnership, mentoring or funding amount); team names, roles, bios and equity; real traction (interviews, letters of intent); hackathon IP rules; contact details. These are the red boxes in the PDF and appendix C. Market numbers marked as assumptions (share of anos finais, 3/4 for 7º–9º) should be replaced by the Inep synopsis before the plan leaves the hackathon.
