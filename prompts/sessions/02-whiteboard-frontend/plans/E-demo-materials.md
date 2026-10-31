# Plan E — Real teaching materials for the demo subjects

## FINAL (merged after independent reviews: Lua = curriculum/product, engineer = pipeline and production data)

**Curriculum (BNCC 8º ano; corrections from review):** BNCC has no "Biologia"/"Física" in Fundamental II — both are *Ciências*. Keep the founder's card names, subtitle the books "Ciências da Natureza · 8º ano". Newton's laws are not 8º-ano content → one clearly labeled **"Aprofundamento"** chapter (kept for the force diagrams).

| Subject (key) | Slice 1 chapters (deep, board-friendly) | Next |
|---|---|---|
| História do Brasil (`history`, renamed) | 1 Crise colonial (Inconfidência, Conjuração Baiana) · 2 Corte no Rio (1808) · 3 Independência (1822, causa→efeito) · 4 Primeiro Reinado e Constituição de 1824 · 5 Regências e revoltas (Cabanagem, Farroupilha, Malês) · 6 Segundo Reinado: café, Lei de Terras (1850), imigração, quilombos, povos indígenas, Abolição (1888) · ponte: 1889 (9º) | maps (SVG), more sources |
| Física (`physics`) | 1 Energia e suas transformações · 2 Circuitos elétricos · 3 Consumo e a conta de luz · 4 Aprofundamento: forças e Leis de Newton | máquinas simples |
| Matemática (`math`) | 1 Notação científica e potências · 2 Equações do 1º grau como retas · 3 Sistemas: duas retas que se cruzam · 4 Estatística (gráficos, média) · box ax² = b | áreas/volumes |
| Biologia (`biology`) | 1 Reprodução nos seres vivos (sexuada × assexuada) · 2 Sistemas nervoso e endócrino, puberdade (feedback hormonal) · 3 Sexualidade e saúde (contracepção, ISTs — BNCC wording, health framing, "procure um adulto de confiança ou uma unidade de saúde") | célula as review box |

**"Good real document" acceptance:** 25–40 pages A4, single column; cover = page 1, printed page number = PDF page (digits only in the footer), **no running header/footer text**; `hyphens: none`, `font-variant-ligatures: none`, local font with pt-BR accents; each chapter starts on a new page with "Capítulo N — Título"; TOC with dot leaders; chapter: opening question, short sections, glossary, box, summary, 6–10 exercises; **no answer key in the ingested PDF** (the tutor would retrieve the answers); per-book **fact table** (every date/number/law → public source), fact-check by a second agent; math answers verified by script; original text only (no rewording of textbooks/Brasil Escola, Wikipedia used for facts only); cover: "Material original produzido pela equipe Mento com apoio de IA, para demonstração"; sexuality never a scripted demo question (demo uses puberty/hormones).

**Pipeline:** Markdown sources committed under `materials/src/<key>/` (add `!materials/src/` to `.gitignore`), PDFs git-ignored; Markdown → HTML print CSS → headless Chrome PDF; verify with a pdfjs dump (text on every page, "ção" intact, chapter start pages) → `--chapters` (no `;` in titles). ~1600-char passages, ~2 per page, ~450 total; Voyage cost cents.

**Ingest path — DECIDED by the founder (2026-10-31):** no file storage on the back-end. The PDFs live in the front-end code (`apps/web/public/materials/<key>.pdf`, committed — they are our original work); the teacher Materials tab (already mock in both modes) lists the four books with `file_url` pointing there; the database only gets the text passages + embeddings via `pnpm ingest`. The paragraph below is superseded.

~~**Ingest path (decision):** the **teacher upload** (`POST /api/materials`) is preferred over `pnpm ingest`: it stores the file (needed for the Must-5 "open the cited page"), the outline and the `sequence` used by analysis/exercises. Risk: uploads live on the API's disk store — confirm it persists on the production host; otherwise fall back to the script and accept no file link.

**Production data (destructive, founder OK required, in this order):** baseline (`db:stats` + subjects/materials list) → ingest the 4 new books (no `--replace`) → per-material retrieval check (extend `retrieval-check` with `--material` / `--questions`, 5 questions per book) → **back up** old materials + chunks (`mongoexport` by id) → `scripts/remove-material.ts --id … [--apply]` (dry run first) for Roma Antiga I, the Roma test upload and Cálculo — hiding is not enough (chunks stay searchable in free sessions) → rename subject `history` to "História do Brasil" directly in the DB (`upsertByKey` won't rename). Never `seed --reset` in production. Old sessions keep their citations (`Livro · p.N`), nothing breaks.

**Around it:** `prompts/subjects/{history (rewritten), physics, math, biology}.md` short (they go into every system prompt), biology with safety guardrails; home icons for biology/physics; check prod for an existing `science` subject; update D2/D67 and `docs/20-demo-runbook.md` (one question per subject; Rome fixtures re-recorded later); one live lesson per subject (student `debug-materials`).

**Estimate:** 5–7 h with parallel agents (4 writers + fact-check), production steps sequential.

---

## Draft (pre-review)

> Status: draft for review (2026-10-31). Founder request: "set exactly which documents each subject on the home has; create them very well, more complete and complex, good documents, they will be used in the demo. Use the internet as reference. Biologia, Física, Matemática, História do Brasil." Founder authorized editing every lane.

## 1. Why
- The home shows one card per subject from `GET /api/subjects`; each card lists its materials. The tutor answers **grounded in these PDFs and cites the page** (`Livro · p.N`), so the demo quality depends on them.
- Today (production DB): História = "História de Roma Antiga I (Coimbra, 2015)" (489 p., university level, Portuguese from Portugal) + "História de Roma Vol. I (teste de upload)" (a test upload); Matemática = "Cálculo Integral: Notas de Aula" (university level). Neither fits 8º ano (the MVP audience, D-decisions) and the founder finds History weak.

## 2. Target: four subjects, one strong book each (8º ano, BNCC-aligned)
| Subject (key) | Book title (working) | Chapters (BNCC 8º ano unless noted) | Demo hooks |
|---|---|---|---|
| **Biologia** (`biology`) | "Ciências da Vida — 8º ano" | 1 Célula e níveis de organização; 2 Sistema nervoso e endócrino (hormônios, puberdade); 3 Reprodução humana e sexualidade (com abordagem escolar); 4 Métodos contraceptivos e ISTs (BNCC EF08CI08–09); 5 Reprodução nos seres vivos (sexuada/assexuada, plantas); 6 Genética introdutória (DNA, cromossomos — ponte para o 9º) | timelines are rare → diagrams of a cell, feedback loop of hormones |
| **Física** (`physics`) | "Física em Movimento — 8º/9º ano" | 1 Movimento (posição, velocidade, aceleração); 2 Forças e as 3 Leis de Newton (atrito, peso, normal, diagramas de corpo livre); 3 Energia (cinética, potencial, conservação, BNCC EF08CI01); 4 Máquinas simples (alavancas, polias, plano inclinado); 5 Eletricidade e circuitos (EF08CI02–05, consumo na conta de luz) | **Plan B diagrams**: free-body, inclined plane, levers, circuits |
| **Matemática** (`math`) | "Matemática 8º ano — Álgebra, Geometria e Funções" | 1 Potências e raízes (expoentes, notação científica); 2 Expressões e produtos notáveis; 3 Equações do 1º grau e sistemas; 4 Ângulos, triângulos e Teorema de Pitágoras (ponte 9º); 5 Funções e gráficos (f(x)=ax+b, f(x)=x², leitura de gráficos); 6 Estatística e probabilidade | Plan B graphs (x², retas), Plan D speech (x², x³), number lines |
| **História do Brasil** (`history_brazil`, name "História do Brasil") | "História do Brasil — Do Período Colonial à Primeira República" | 1 O Brasil colonial em resumo (ciclos, escravidão); 2 A crise do sistema colonial (Inconfidência Mineira, Conjuração Baiana); 3 A vinda da Corte (1808) e o Reino Unido; 4 Independência (1822); 5 Primeiro Reinado e Constituição de 1824; 6 Período Regencial e revoltas (Cabanagem, Farroupilha, Malês, Balaiada, Sabinada); 7 Segundo Reinado (café, Guerra do Paraguai); 8 Abolição (leis, 1888) e Proclamação da República (1889) | timelines, maps (draw), circle dates; speech "séc. XIX" (Plan D) |

Each book: **35–60 pages**, A4, real text layer, page numbers in the footer, chapter titles that match `--chapters`, per chapter: abertura (pergunta-problema), texto principal em seções curtas, boxes ("Você sabia?", "Glossário", "Fonte histórica / Experimento"), linha do tempo or diagram/table where natural, resumo, 6–10 atividades com gabarito ao final, referências. Language pt-BR, 8º ano reading level (short paragraphs, defined terms), accurate facts, no learning-styles, inclusive and age-appropriate (reprodução/sexualidade written as in a school textbook).

## 3. Content sourcing and copyright
- Write **original text** (no copying from textbooks or sites). Use public, citable references only for facts: BNCC (gov), Portal do MEC, Brasil Escola/Mundo Educação (facts only), Wikipedia pt (CC BY-SA, facts), IBGE, Arquivo Nacional, Fiocruz, Khan Academy pt (facts), INMETRO units. Each chapter ends with "Referências" (title + URL + access date).
- Quotes from historical sources (e.g. Lei Áurea, Constituição de 1824) are public domain — allowed, short.
- Figures: no copyrighted images. Use simple vector figures generated by us (SVG → PDF) or none; the tutor draws on the board anyway.
- Facts checked by a second agent (fact-check pass per book) before PDF generation.

## 4. Production pipeline (repo, reproducible)
- Source in Markdown: `materials/src/<key>/book.md` (+ `chapters.json` with page ranges filled after render). Git-ignored? **Decision:** commit the Markdown sources (they are ours, small, reviewable) under `materials/src/`; keep generated PDFs git-ignored in `materials/` (as today).
- Render: Markdown → HTML (simple template with print CSS: A4, Nunito Sans/serif body, page numbers via `@page`) → PDF with headless Chrome (`--print-to-pdf`, available on the machine) via `scripts/render-materials.ts`. Fallback: reportlab (installed).
- Verify text layer with `pdfjs-dist` (already a dependency): every page has text; chapter start pages detected → fill `--chapters`.
- Ingest: `pnpm ingest materials/<key>.pdf --title="…" --subject=<key> --subject-name="…" --chapters="…"`. Add `biology`, `physics`, `history_brazil` to `SUBJECT_NAMES` in `scripts/ingest.ts`.

## 5. Product/code changes around it
- **Subject profiles** for the tutor: `prompts/subjects/{biology,physics,math,history_brazil}.md` (history.md stays for Rome if kept) — what to draw, which board tools fit (timelines for history, `draw_diagram` for physics/math), vocabulary level, safety for reproduction topics.
- **Home icons** by key: biology (leaf/dna), physics (atom/bolt), history_brazil (landmark/flag) in `_components/home/format.ts`.
- **Demo runbook** `docs/20-demo-runbook.md`: one scripted question per subject that shows the board (e.g. "Por que o Brasil ficou independente em 1822?", "O que acontece com um bloco quando eu empurro?", "Como é o gráfico de x²?", "Como os hormônios mudam na puberdade?").

## 6. Production data (destructive — needs explicit founder OK)
- Add the 4 subjects/materials to the production DB (`.env`).
- **Remove from the home:** "História de Roma Vol. I (teste de upload)" and the Cálculo book from `math`; decide about "História de Roma Antiga I": keep as a second História subject or remove. The ingest script has `--replace`; there is no delete route — a small `scripts/remove-material.ts` (by id, dry-run first) would be needed. Old sessions keep their stored citations (material ids) — removing a material may break "open source" links in old lessons only.
- Proposal: keep Roma under subject `history` hidden? Simpler: **archive** = set material status to something the subjects route filters out, if supported; otherwise delete after backup (JSON export of the material + chunks).

## 7. Validation
- Per book: page count, text on every page, chapter page ranges correct, `retrieval-check` script returns the right page for 5 questions per book.
- Live: one real lesson per subject (student `debug-materials`) — tutor cites `Livro · p.N` from the new book, board uses timelines/diagrams; record in the PR.
- Fact-check report per book (agent), plus founder skim.

## 8. Execution (parallel)
4 writer agents (one per book, each with a fact-checker pass) in separate worktrees → render + verify → ingest (sequential, production) → profiles/icons/runbook PR → live check. Estimate: 3–4 h wall clock with agents.

## 9. Decisions for the founder
1. Replace Roma and Cálculo on the home (remove/archive) — or keep them alongside?
2. Physics at 8º/9º with Newton (BNCC puts Newton's laws in 9º; demo value is high).
3. Biology includes reproduction/sexuality/ISTs (BNCC 8º) — keep, with school-textbook tone?
4. Commit Markdown sources in the repo (recommended) — PDFs stay git-ignored.
5. Is there a fifth subject? (the request list ended with an empty item.)
