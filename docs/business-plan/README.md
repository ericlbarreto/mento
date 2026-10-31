# Business plan and pitch

> Content is in Brazilian Portuguese (pt-BR) because the audience (Brazilian investors and hackathon judges) is Brazilian; file names and this README are English (AGENTS.md language policy).

| File | What it is |
|---|---|
| `plano-de-negocios-mento.pdf` | Business plan (12 pages) answering Teachy Challenge 3 (safe AI, saves time, preserves learning): problem with data (student, teacher, school), how each product decision answers it, evidence and its limits, pilot design to measure it, market and go-to-market, risks, sources and assumptions. No pricing or financial projections |
| `plano-de-negocios-mento.html` | **Source** of the PDF (single file; images in `assets/`) |
| `pitch-5min.md` | 5-minute pitch script with live demo: minute-by-minute words, demo steps, fallback plan, Q&A prep, research sources |
| `assets/` | Logo and mascot used by the PDF (copies of `assets/brand/`) |

## Rebuild the PDF

macOS with Google Chrome installed:

```bash
cd docs/business-plan && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf=plano-de-negocios-mento.pdf file://$PWD/plano-de-negocios-mento.html
```

## What the founder must fill in (cannot be known from the repository)

The ask (partnership, mentoring or funding amount); team names, roles, bios and equity; real traction (interviews, letters of intent); hackathon IP rules; contact details. These are red boxes in the PDF and appendix D. Also verify every item tagged "NÃO VERIF." (share of private schools, PISA numbers, secondary sources for Cetic.br 2025 and Bastani) before showing the plan outside the hackathon.
