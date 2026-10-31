# 23: Illustrate on your own

## Prompt (verbatim, Portuguese)

> Beijo, irmão. Quero que você faça imagem para caralho, tá? Sério, sério, sério, sério, sério. Não precisa exagerar também, né, mas seja mais proativo no sentido de ser mais ilustrativo, sabe? Vai ensinar matemática, coloca um gráfico. Vai ensinar sobre Roma antiga, desenha um coliseu, entendeu? Tipo de coisa. Não precisa esperar o cara pedir para você gerar uma imagem para você gerar a imagem.

## What was done

- `prompts/base.md` rule 8: illustrate without being asked; every reply that introduces something new starts with a `draw`; abstract ideas get a picture too (graph, figure, scene) with labels and numbers in text; two pictures per reply are fine.
- `prompts/subjects/generic.md`: math, science and geography examples.
- Scripted lesson (Augusto, soldier, Coliseu, aqueduct): every reply started with a `draw`.
- Limit: exact numeric charts need the structured SVG renderer (`is_structured`, not built: it falls back to a caption card), so math graphs are drawn as pictures without numbers.
