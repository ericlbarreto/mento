# Google Stitch prompts: Mento screens

> Ready-to-paste prompts for [Google Stitch](https://stitch.withgoogle.com) to generate the Mento screens, then export to Figma.
> Sources: `docs/18-ui-references.md`, `docs/19-brand-assets.md`, `docs/06-teacher-interface.md`, `docs/02-student-experience-whiteboard.md`, `docs/01-hackathon-scope.md`. Written 2026-10-30.

## How to use

1. Paste **Prompt 0 (design system)** first, in a new Stitch project, Web, desktop 1440 px.
2. Then paste **one screen prompt at a time** in the same project, so Stitch keeps the style. One screen per prompt works better than all at once.
3. After each screen, upload `assets/brand/logo.png` and `assets/brand/mascot.png` as references if Stitch drew placeholders, and ask it to swap them in.
4. Export to Figma ("Copy to Figma" / paste into Figma).
5. Prompts are in English (Stitch follows English better); **all UI copy is pt-BR**, already in the prompts.

---

## Prompt 0: design system (paste first)

```
Design a desktop web app called "Mento", an AI tutoring platform for Brazilian middle schools (7th to 9th grade). It has two interfaces that must look like ONE product: a student whiteboard tutor and a teacher dashboard. All UI copy in Brazilian Portuguese.

Visual style: warm, calm, friendly, "paper and ink". Light beige paper look, never dark mode. Soft, alive, but not childish.

Colors:
- Background paper #FBF7EE (whole app)
- Panels and drawers #F5EEDF
- Cards #FFFDF8 with soft shadow
- Borders and dividers #E7DECB
- Text and headings: navy #162250
- Primary (buttons, links, active states, selection, orb ring): Mento blue #1E59ED
- Soft blue tint behind chips and selected items #E6EDFD
- Light accent for sparkles #B1D8FA
- Orange #FC724A only for tiny highlights and alerts, never large surfaces
- Marker highlights: soft yellow #FFE58A and soft blue #CFE0FF

Typography: rounded friendly sans-serif (Nunito) for all UI and headings, no serif. Whiteboard content uses a handwriting font (Caveat) in navy.

Shapes: rounded cards 16-20 px radius, pill-shaped chips and buttons, generous padding, lots of white space, outline icons (Lucide style).

Brand: logo is a flowing blue wave-shaped "m" symbol plus a lowercase navy "mento" wordmark. Mascot is a round blue character with a dark navy wavy tuft shaped like an "M", big white eyes, small smile, light-blue belly and two small rounded hands.

Reusable components: pill chips in 4 variants (source chip "Livro · p.12" in soft blue with a page icon; status chip; badge "Dados simulados" in soft orange outline; tag "Fora do material" in beige with an info icon), primary and secondary pill buttons, cards, a table, an insight card, a right-side drawer, an empty state with the mascot.

Start with a style guide screen showing the color palette, typography scale, buttons, the 4 chip variants, a card and the mascot.
```

---

## Prompt 1: student start screen

```
Mento student start screen, desktop 1440x900, same design system. Background beige paper #FBF7EE with a very subtle soft blue radial gradient.

Top left: the Mento logo. Top right: a small avatar with the student's name "Maya Pereira" (the student is already signed in; no name picker).

Center top: a large greeting "Oi, Maya!" and the subtitle "O que vamos estudar hoje?".

A row of large subject cards (rounded 20 px, card color #FFFDF8, soft shadow, an outline icon for each subject, hover lifts the card):
- "História" with a column/temple icon, "3 materiais"
- "Matemática" with a ruler/compass icon, "2 materiais"
- "Ciências" with a flask icon, "1 material"
- "Geografia" with a globe icon, "0 materiais" (disabled, muted)
The count is a small soft-blue pill chip.

Below the cards, centered: the Mento mascot (about 120 px) inside a soft blue glowing ring, as a big round button, with the label "Conversar com o Mento" and the helper text "Sem material, sobre qualquer assunto".

No topic field, no "Começar" button: clicking a card or the mascot opens the whiteboard directly.

Friendly, airy, focused. No navigation menu, no login.
```

---

## Prompt 2: tutor session (main whiteboard, tutor speaking)

```
Mento tutor session screen, desktop 1440x900, same design system. This is the core of the product: a full-screen whiteboard where an AI tutor writes and draws live while it talks.

Top bar (thin, transparent over the board): left a back arrow and the session title "História · República e Império"; right a secondary pill button "Material" with a book icon, and a "more" icon.

Board (fills the screen, beige paper #FBF7EE with a faint dotted grid): content laid out in 2-3 columns, written in a navy handwriting font, like a teacher's notes:
- Title handwritten: "Da República ao Império"
- A horizontal timeline with exact dates: "509 a.C. — Início da República", "44 a.C. — Morte de Júlio César", "27 a.C. — Augusto, primeiro imperador". The date "27 a.C." has a soft yellow marker highlight and a hand-drawn blue circle around it.
- A simple line-art illustration of the Colosseum (thick outline, cartoon style, few strokes, navy and soft blue).
- A short handwritten block: "Senado perde poder → o imperador concentra as decisões", with a hand-drawn arrow.
- Small source chips under elements: "Livro · p.42", "Livro · p.45".

Bottom center: the voice "orb": the round blue mascot (about 120 px) inside a glowing Mento blue ring with an animated waveform around it (speaking state). Just above the orb: a caption line in large, high-contrast navy text "Repare nessa data: 27 a.C. Foi quando Augusto…" with the current word highlighted in blue. Under the caption: chips "Livro · p.45" and "Fora do material".

Bottom left: round icon buttons for pause, volume, and "CC" captions toggle. Bottom right: round icon buttons for keyboard and microphone (mic is the primary blue).

Right side: a collapsible chat panel (about 340 px, panel color #F5EEDF) with the conversation so far: the tutor's first message "Oi, Maya! O que você quer estudar hoje em História?", the student's spoken reply "República e Império" (with a small mic icon showing it was said by voice), and the tutor's messages with source chips. A text input at the bottom "Escreva uma mensagem…".

Calm, alive, the board is the hero; controls are minimal and float over it.
```

Add one more variant of this screen: **"Opening"**. The board is empty with a faint handwritten "Olá!" in the center; the orb is in the speaking state; the caption says "Oi, Maya! O que você quer estudar hoje em História?"; the mic button glows blue with the label "ouvindo…" right after; the chat panel shows only that first tutor message.

---

## Prompt 3: tutor session variants (same screen, 4 states)

```
Create 4 variants of the Mento tutor session screen, same layout and board content as before, each showing a different state:

A) "Pensando": the orb shows the mascot with a thinking pose and a rotating blue gradient arc; small label "pensando…" under the orb. Captions empty.

B) Click-and-ask: the student clicked the timeline item "27 a.C."; it has a blue outline pulse and a small floating popover next to it with a text input "Pergunte sobre isso…" pre-filled with "Por que essa data?" and a blue send button. The orb is slightly bigger ("perked up").

C) Verification question: a handwritten card appears on the board with a soft blue border: "Pergunta: O que mudou no papel do Senado quando Augusto virou imperador?". The orb has a soft pulse and label "sua vez". The keyboard input is open above the orb: a wide rounded text field "Escreva sua resposta…" with a mic icon and a send button.

D) Wrong answer, gentle feedback: no red. The tutor writes a new simpler explanation in a new column with a small hand-drawn comparison table "República | Império" (rows: quem decide, papel do Senado). Caption: "Quase! Vamos olhar de outro jeito." Mascot looks encouraging.
```

---

## Prompt 4: material drawer (PDF at the cited page)

```
Mento tutor session with the material drawer open, desktop 1440x900. The board stays visible on the left (dimmed slightly). On the right, a drawer about 520 px wide, panel color #F5EEDF, rounded left corners:
- Header: book icon, "História Geral: Roma Antiga", a close X.
- Page navigation: "p. 45 de 86" with prev/next arrows and zoom controls.
- A PDF page preview (book text in Portuguese about Augusto and the Empire) with one paragraph highlighted in soft yellow #FFE58A: the excerpt the tutor cited.
- Below the page: a card "Trecho citado" with the quote in italics and the source chip "Livro · p.45".
Opened because the student clicked a source chip on the board.
```

---

## Prompt 5: teacher, Students tab ("Alunos")

```
Mento teacher dashboard, Students tab, desktop 1440x900, same design system as the student side (beige paper, navy text, Mento blue, rounded cards, pill chips). Warm and editorial, like a modern teacher tool, not a corporate BI dashboard.

Left sidebar (about 240 px, panel color #F5EEDF): Mento logo at the top; only two nav items with icons: "Alunos" (active, blue tint) and "Materiais". Nothing else.

Main area:
- Page title "Alunos".
- Row of 4 metric cards: "Alunos 12" (small note "9 simulados"), "Conversas 37", "Lacunas identificadas 9", "Insights gerados 58". Large numbers, small labels.
- Class context card ("Turma"): chip "8º ano · Ensino Fundamental II" and the description "Turma de 8º ano, nível de leitura mediano, gostam de jogos e vídeos curtos, dificuldade com datas e linha do tempo." with a secondary button "Editar".
- Student table with columns: Aluno (avatar initials + name), Conversas, Última atividade, Lacunas abertas, Último insight. Rows: Maya Pereira (3, "hoje, 14:20", 1, "Confunde República e Império", chip "novo" in orange); Jordan Lima (5, "ontem", 2, …, badge "Dados simulados"); Ana Souza, Pedro Alves, Beatriz Costa (all with "Dados simulados" badge).
- Top right of the table: primary blue pill button "+ Criar aluno".

No rankings, no scores, no red/green grades. Calm and readable.
```

---

## Prompt 6: teacher, student detail

```
Mento teacher dashboard, student detail page for "Maya Pereira", desktop 1440x900, same sidebar ("Alunos" active) and design system.

Header: back link "← Alunos", avatar, name "Maya Pereira", "3 conversas · última atividade hoje, 14:20".

Sections as rounded cards:

1) "Evolução": one row per concept with small dot timelines across conversations (filled blue dot = answered correctly without help, hollow = needed a hint), and "n = 4" on each row. Concepts: "República Romana", "Fim da República", "Augusto e o Império", "Papel do Senado". One concept shows a neutral grey chip "evidência insuficiente".

2) "Lacunas" (gaps): an insight card with a small orange left accent: concept "Papel do Senado no Império", description "Confunde o poder do Senado na República e no Império.", a quote block with the student's own words in italics: "o Senado continuou mandando em tudo depois de Augusto", a link "Ver momento da conversa", meta "Confiança: média · visto 2 vezes", chip "novo".

3) "Sugestões": a card "Retomar República vs Império com uma atividade de linha do tempo comparativa." with two buttons: primary "Aceitar" and secondary "Dispensar". Small note "A IA sugere; você decide."

4) "Progresso": a positive note card with a small sparkle icon: "Agora explica a concentração de poder em Augusto sem pistas."

5) "Conversas": a list of 3 sessions (date, material "História Geral: Roma Antiga", topic "República e Império", duration).

Every insight shows uncertainty; no scores, no rankings, no psychological labels.
```

---

## Prompt 7: teacher, Materials tab ("Materiais")

```
Mento teacher dashboard, Materials tab, desktop 1440x900, same sidebar ("Materiais" active) and design system.

Title "Materiais" with subtitle "PDFs que o tutor usa como base para as respostas.". Top right: primary blue pill button "Enviar PDF" with an upload icon.

A list of material cards/rows: PDF icon or cover thumbnail, title, subject chip, pages, date, status chip, action "Abrir PDF":
- "História Geral: Roma Antiga" · História · 86 páginas · status "Pronto" (blue)
- "Atlas Histórico" · Geografia · 40 páginas · status "Processando 18/40" with a thin blue progress bar
- "Apostila Ciências 8º ano" · Ciências · status "Na fila" (beige)
- "Revolução Industrial.pdf" · História · status "Falhou" (orange outline) with a "Tentar de novo" link

Also design the empty state of this tab: mascot (120 px), text "Nenhum material ainda. Envie um PDF para o tutor ensinar a partir dele." and the "Enviar PDF" button.
```

---

## Prompt 8: teacher modals

```
Design 3 modals for the Mento teacher dashboard, centered over the dimmed Students/Materials tab, card #FFFDF8, 20 px radius:

1) "Criar aluno": one field "Nome do aluno", helper text "O aluno escolhe o próprio nome na tela inicial. Use apenas dados fictícios no protótipo.", buttons "Cancelar" and primary "Criar".

2) "Editar turma": a segmented control for grade level "7º ano | 8º ano | 9º ano" (8º selected), a textarea "Descrição da turma" with the example text about reading level and interests, a character counter "142/400", helper "Não inclua nomes ou dados pessoais. O tutor adapta linguagem e exemplos a esta descrição.", buttons "Cancelar" and "Salvar".

3) "Enviar PDF": a dashed drag-and-drop area "Arraste um PDF aqui ou clique para escolher", field "Título" (pre-filled with the file name), a select "Matéria" (História, Matemática, Ciências, Português, Geografia, Outro), buttons "Cancelar" and "Enviar".
```

---

## Prompt 9 (optional): loading and splash

```
Mento loading/splash screen: beige paper background, the round blue mascot spinning in the center (about 180 px), the Mento logo fading in below it, small text "Preparando sua aula…". Minimal, calm.
```

---

## Notes

- If Stitch makes it look too "corporate dashboard", add: *"warmer, more editorial, more white space, like paper notes, fewer borders"*.
- If it uses a serif or a dark theme, add: *"no serif fonts, light beige theme only"*.
- Keep the copy rules: **no rankings, no grades, no psychological labels**, "Dados simulados" badge on simulated students (AGENTS.md rules 4–6).
