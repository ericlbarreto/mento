# Business plan and pitch

> Content is in Brazilian Portuguese (pt-BR) because the audience (Brazilian investors and hackathon judges) is Brazilian; file names and this README are English (AGENTS.md language policy).

| File | What it is |
|---|---|
| `plano-de-negocios-mento.pdf` | Investor business plan / investment memo (23 pages): problem, solution, market (TAM/SAM/SOM), business model, unit economics, go-to-market, competition, technology and privacy, traction, team, scenarios, roadmap, funding, risks, sources and assumptions |
| `plano-de-negocios-mento.html` | **Source** of the PDF (single file; images in `assets/`) |
| `pitch-5min.md` | 5-minute pitch script with live demo: minute-by-minute words, demo steps, fallback plan, Q&A prep, research sources |
| `assets/` | Logo and mascot used by the PDF (copies of `assets/brand/`) |

## Rebuild the PDF

macOS with Google Chrome installed:

```bash
cd docs/business-plan && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf=plano-de-negocios-mento.pdf file://$PWD/plano-de-negocios-mento.html
```

The table of contents page numbers are typed by hand in the HTML; after a layout change, check them against the PDF.

## What the founder must fill in (cannot be known from the repository)

Funding amount, instrument, valuation, runway; team names, roles, bios and equity; real traction (interviews, letters of intent); pilot price; hackathon IP rules; contact details. These are red boxes in the PDF and appendix D. Also verify every item tagged "NÃO VERIF." (market share of private schools, provider prices, PISA numbers) before showing the plan outside the hackathon.
